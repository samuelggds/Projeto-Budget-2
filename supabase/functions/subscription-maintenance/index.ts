import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

// O prazo do PIX e independente do prazo de tolerancia da assinatura.
// Enquanto existir uma fatura pendente, um novo PIX sera criado sempre que
// a cobranca anterior expirar ou for encerrada sem pagamento.
const PIX_VALIDITY_DAYS = 7;
const terminalStatuses = new Set([
  "expired",
  "cancelled",
  "canceled",
  "failed",
  "rejected",
]);

function normalizedStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function hasExpiredLocally(invoice: Record<string, unknown>, now: Date) {
  if (!invoice.pix_expires_at) return false;
  const expiresAt = new Date(String(invoice.pix_expires_at)).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

function isTerminalWithoutPayment(order: Record<string, unknown>) {
  const transactions = order.transactions as
    | { payments?: Array<Record<string, unknown>> }
    | undefined;
  const payment = transactions?.payments?.[0];
  return (
    terminalStatuses.has(normalizedStatus(order.status)) ||
    terminalStatuses.has(normalizedStatus(payment?.status)) ||
    terminalStatuses.has(normalizedStatus(payment?.status_detail))
  );
}

async function idempotencyKey(seed: string) {
  const bytes = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function authorized(request: Request) {
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (cronSecret && request.headers.get("x-cron-secret") === cronSecret)
    return true;
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  const client = createUserClient(authorization);
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return false;
  const { data } = await client
    .from("app_user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return data?.role === "BILLING_ADMIN" || data?.role === "ADMIN";
}

function mercadoPagoConfig() {
  const production = Deno.env.get("MERCADO_PAGO_ENVIRONMENT") === "production";
  const accessToken = production
    ? (Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ?? "")
    : (Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_TEST") ?? "");
  return {
    production,
    accessToken,
    payer: production
      ? { email: Deno.env.get("MERCADO_PAGO_PAYER_EMAIL") ?? "" }
      : { email: "test_user_br@testuser.com", first_name: "APRO" },
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (!(await authorized(request)))
    return response({ error: "Usuário não autorizado" }, 403);

  try {
    const admin = createAdminClient();
    const { data: subscription, error } = await admin
      .from("app_subscription")
      .select("*")
      .eq("id", "main")
      .single();
    if (error) throw error;
    if (!subscription.billing_enabled)
      return response({ subscription, message: "Mensalidade desativada" });

    const now = new Date();
    const isOverdue =
      subscription.grace_period_ends_at &&
      now > new Date(subscription.grace_period_ends_at);

    if (isOverdue) {
      if (subscription.status !== "BLOCKED") {
        const { data, error: blockError } = await admin.rpc(
          "block_overdue_subscription",
        );
        if (blockError) throw blockError;
        Object.assign(subscription, data);
      }
      if (subscription.deactivated_at) {
        return response({ subscription, message: "Mensalidade desativada" });
      }
      // Mesmo bloqueado, continua abaixo para manter uma cobranca PIX valida.
    }

    if (!isOverdue && now < new Date(subscription.current_period_ends_at)) {
      return response({ subscription, message: "Ciclo ainda está vigente" });
    }

    const periodEnd = new Date(subscription.current_period_ends_at);
    const externalReference = `mg-monthly-${periodEnd.toISOString().replace(/\D/g, "").slice(0, 14)}`;
    let { data: invoice } = await admin
      .from("subscription_invoices")
      .select("*")
      .eq("external_reference", externalReference)
      .maybeSingle();

    const mercadoPago = mercadoPagoConfig();
    if (!invoice) {
      const { data, error: insertError } = await admin
        .from("subscription_invoices")
        .insert({
          subscription_id: "main",
          external_reference: externalReference,
          amount: mercadoPago.production ? subscription.monthly_amount : 50,
          period_started_at: subscription.current_period_started_at,
          period_ends_at: subscription.current_period_ends_at,
          due_at: subscription.current_period_ends_at,
          grace_period_ends_at: subscription.grace_period_ends_at,
        })
        .select()
        .single();
      if (insertError) throw insertError;
      invoice = data;
    }

    if (!mercadoPago.accessToken || !mercadoPago.payer.email)
      throw new Error("Credenciais do Mercado Pago incompletas");

    const chargeAmount = Number(invoice.amount);
    if (!Number.isFinite(chargeAmount) || chargeAmount <= 0)
      throw new Error("Valor da cobrança inválido");
    const mercadoPagoAmount = chargeAmount.toFixed(2);

    if (invoice.mercado_pago_order_id) {
      const previousOrderId = String(invoice.mercado_pago_order_id);
      const orderResponse = await fetch(
        `https://api.mercadopago.com/v1/orders/${encodeURIComponent(previousOrderId)}`,
        {
          headers: { Authorization: `Bearer ${mercadoPago.accessToken}` },
        },
      );
      const order = await orderResponse.json();

      if (orderResponse.ok) {
        const payment = order.transactions?.payments?.[0];
        const paid =
          order.status === "processed" ||
          payment?.status === "processed" ||
          payment?.status_detail === "accredited";

        if (paid) {
          const { data: paidSubscription, error: paidError } = await admin.rpc(
            "mark_subscription_invoice_paid",
            {
              target_external_reference: invoice.external_reference,
              target_order_id: order.id,
              target_payment_id: payment?.id ?? null,
              payment_time: new Date().toISOString(),
            },
          );
          if (paidError) throw paidError;
          return response({
            subscription: paidSubscription,
            message: "Pagamento confirmado",
          });
        }

        const shouldRenew =
          hasExpiredLocally(invoice as Record<string, unknown>, now) ||
          isTerminalWithoutPayment(order as Record<string, unknown>);

        if (!shouldRenew && invoice.pix_qr_code) {
          return response({
            invoice,
            message: `Pagamento ainda pendente (${order.status ?? "sem status"} / ${payment?.status_detail ?? payment?.status ?? "sem detalhe"})`,
          });
        }
      } else if (orderResponse.status !== 404) {
        throw new Error(
          order?.message ?? "Não foi possível consultar a cobrança existente",
        );
      }
      // Order expirada/encerrada ou nao encontrada: gera uma nova abaixo.
    }

    const generationSeed = [
      invoice.id,
      invoice.mercado_pago_order_id ?? "initial",
      invoice.pix_expires_at ?? "initial",
    ].join(":");
    const mercadoPagoResponse = await fetch(
      "https://api.mercadopago.com/v1/orders",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mercadoPago.accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": await idempotencyKey(generationSeed),
        },
        body: JSON.stringify({
          type: "online",
          total_amount: mercadoPagoAmount,
          external_reference: externalReference,
          processing_mode: "automatic",
          transactions: {
            payments: [
              {
                amount: mercadoPagoAmount,
                payment_method: { id: "pix", type: "bank_transfer" },
                expiration_time: `P${PIX_VALIDITY_DAYS}D`,
              },
            ],
          },
          payer: mercadoPago.payer,
        }),
      },
    );
    const order = await mercadoPagoResponse.json();
    if (!mercadoPagoResponse.ok)
      throw new Error(
        order?.message ?? "Mercado Pago recusou a criação do Pix",
      );

    const payment = order.transactions?.payments?.[0];
    const method = payment?.payment_method ?? {};
    if (!method.qr_code)
      throw new Error("Mercado Pago criou a cobrança sem retornar o QR Code Pix");

    const pixExpiresAt = new Date(
      now.getTime() + PIX_VALIDITY_DAYS * 86400000,
    ).toISOString();
    const { data: updatedInvoice, error: updateError } = await admin
      .from("subscription_invoices")
      .update({
        mercado_pago_order_id: order.id,
        mercado_pago_payment_id: payment?.id ?? null,
        pix_qr_code: method.qr_code,
        pix_qr_code_base64: method.qr_code_base64 ?? null,
        pix_ticket_url: method.ticket_url ?? null,
        pix_expires_at: pixExpiresAt,
        updated_at: now.toISOString(),
      })
      .eq("id", invoice.id)
      .select()
      .single();
    if (updateError) throw updateError;

    // O fim da tolerancia controla o bloqueio. Renovar o PIX jamais reabre acesso.
    if (!isOverdue && subscription.status !== "GRACE") {
      await admin
        .from("app_subscription")
        .update({ status: "GRACE", updated_at: now.toISOString() })
        .eq("id", "main");
    }

    return response({
      invoice: updatedInvoice,
      message: invoice.mercado_pago_order_id
        ? "Pix expirado renovado automaticamente"
        : "Pix criado",
    });
  } catch (error) {
    return response(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro na manutenção da mensalidade",
      },
      400,
    );
  }
});
