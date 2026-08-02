import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient } from "../_shared/supabase.ts";

const encoder = new TextEncoder();

async function validSignature(request: Request, dataId: string) {
  const secret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET") ?? "";
  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(signature.split(",").map((item) => item.trim().split("=")));
  if (!secret || !parts.ts || !parts.v1 || !requestId || !dataId) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(manifest));
  const expected = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return expected === parts.v1;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const body = await request.json();
    const orderId = String(body?.data?.id ?? new URL(request.url).searchParams.get("data.id") ?? "");
    if (!(await validSignature(request, orderId.toLowerCase()))) return new Response("Invalid signature", { status: 401 });
    const production = Deno.env.get("MERCADO_PAGO_ENVIRONMENT") === "production";
    const accessToken = production ? Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") : Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_TEST");
    if (!accessToken) throw new Error("Access Token ausente");
    const orderResponse = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const order = await orderResponse.json();
    if (!orderResponse.ok) throw new Error("Não foi possível consultar a order");
    const payment = order.transactions?.payments?.[0];
    const paid = order.status === "processed" || payment?.status === "processed" || payment?.status_detail === "accredited";
    if (paid && order.external_reference) {
      const admin = createAdminClient();
      const { error } = await admin.rpc("mark_subscription_invoice_paid", {
        target_external_reference: order.external_reference, target_order_id: order.id,
        target_payment_id: payment?.id ?? null, payment_time: new Date().toISOString(),
      });
      if (error) throw error;
    }
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("ok", { status: 200 });
  }
});
