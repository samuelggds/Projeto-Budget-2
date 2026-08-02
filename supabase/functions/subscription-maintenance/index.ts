import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

async function authorized(request: Request) {
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (cronSecret && request.headers.get("x-cron-secret") === cronSecret) return true;
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  const client = createUserClient(authorization);
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return false;
  const { data } = await client.from("app_user_roles").select("role").eq("user_id", userData.user.id).maybeSingle();
  return data?.role === "BILLING_ADMIN" || data?.role === "ADMIN";
}

function mercadoPagoConfig() {
  const production = Deno.env.get("MERCADO_PAGO_ENVIRONMENT") === "production";
  const accessToken = production
    ? Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ?? ""
    : Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_TEST") ?? "";
  return {
    production,
    accessToken,
    payer: production
      ? { email: Deno.env.get("MERCADO_PAGO_PAYER_EMAIL") ?? "" }
      : { email: "test_user_br@testuser.com", first_name: "APRO" },
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await authorized(request))) return response({ error: "Usuário não autorizado" }, 403);

  try {
    const admin = createAdminClient();
    const { data: subscription, error } = await admin.from("app_subscription").select("*").eq("id", "main").single();
    if (error) throw error;
    if (!subscription.billing_enabled) return response({ subscription, message: "Mensalidade desativada" });

    const now = new Date();
    if (now > new Date(subscription.grace_period_ends_at)) {
      const { data, error: blockError } = await admin.rpc("block_overdue_subscription");
      if (blockError) throw blockError;
      return response({ subscription: data, message: "Mensalidade bloqueada por atraso" });
    }

    if (now < new Date(subscription.current_period_ends_at)) {
      return response({ subscription, message: "Ciclo ainda está vigente" });
    }

    const periodEnd = new Date(subscription.current_period_ends_at);
    const externalReference = `mg-monthly-${periodEnd.toISOString().replace(/\D/g, "").slice(0, 14)}`;
    let { data: invoice } = await admin.from("subscription_invoices").select("*").eq("external_reference", externalReference).maybeSingle();

    const mercadoPago = mercadoPagoConfig();
    if (!invoice) {
      const { data, error: insertError } = await admin.from("subscription_invoices").insert({
        subscription_id: "main", external_reference: externalReference, amount: mercadoPago.production ? subscription.monthly_amount : 50,
        period_started_at: subscription.current_period_started_at, period_ends_at: subscription.current_period_ends_at,
        due_at: subscription.current_period_ends_at, grace_period_ends_at: subscription.grace_period_ends_at,
      }).select().single();
      if (insertError) throw insertError;
      invoice = data;
    }

    if (!mercadoPago.accessToken || !mercadoPago.payer.email) throw new Error("Credenciais do Mercado Pago incompletas");
    const chargeAmount = Number(invoice.amount);
    if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) throw new Error("Valor da cobrança inválido");
    const mercadoPagoAmount = chargeAmount.toFixed(2);
    if (invoice.mercado_pago_order_id) {
      const orderResponse = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(invoice.mercado_pago_order_id)}`, {
        headers: { Authorization: `Bearer ${mercadoPago.accessToken}` },
      });
      const order = await orderResponse.json();
      if (orderResponse.ok) {
        const payment = order.transactions?.payments?.[0];
        const paid = order.status === "processed" || payment?.status === "processed" || payment?.status_detail === "accredited";
        if (paid) {
          const { data: paidSubscription, error: paidError } = await admin.rpc("mark_subscription_invoice_paid", {
            target_external_reference: invoice.external_reference,
            target_order_id: order.id,
            target_payment_id: payment?.id ?? null,
            payment_time: new Date().toISOString(),
          });
          if (paidError) throw paidError;
          return response({ subscription: paidSubscription, message: "Pagamento confirmado" });
        }
      }
      if (invoice.pix_qr_code) {
        const payment = order.transactions?.payments?.[0];
        return response({
          invoice,
          message: `Pagamento ainda pendente (${order.status ?? "sem status"} / ${payment?.status_detail ?? payment?.status ?? "sem detalhe"})`,
        });
      }
    }

    const remainingDays = Math.max(1, Math.min(30, Math.ceil((new Date(subscription.grace_period_ends_at).getTime() - now.getTime()) / 86400000)));
    const mercadoPagoResponse = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: { "Authorization": `Bearer ${mercadoPago.accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": invoice.id },
      body: JSON.stringify({
        type: "online", total_amount: mercadoPagoAmount, external_reference: externalReference,
        processing_mode: "automatic", transactions: { payments: [{ amount: mercadoPagoAmount, payment_method: { id: "pix", type: "bank_transfer" }, expiration_time: `P${remainingDays}D` }] },
        payer: mercadoPago.payer,
      }),
    });
    const order = await mercadoPagoResponse.json();
    if (!mercadoPagoResponse.ok) throw new Error(order?.message ?? "Mercado Pago recusou a criação do Pix");
    const payment = order.transactions?.payments?.[0];
    const method = payment?.payment_method ?? {};
    const { data: updatedInvoice, error: updateError } = await admin.from("subscription_invoices").update({
      mercado_pago_order_id: order.id, mercado_pago_payment_id: payment?.id ?? null,
      pix_qr_code: method.qr_code ?? null, pix_qr_code_base64: method.qr_code_base64 ?? null,
      pix_ticket_url: method.ticket_url ?? null,
      pix_expires_at: new Date(now.getTime() + remainingDays * 86400000).toISOString(), updated_at: now.toISOString(),
    }).eq("id", invoice.id).select().single();
    if (updateError) throw updateError;
    await admin.from("app_subscription").update({ status: "GRACE", updated_at: now.toISOString() }).eq("id", "main");
    return response({ invoice: updatedInvoice, message: "Pix criado" });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Erro na manutenção da mensalidade" }, 400);
  }
});
