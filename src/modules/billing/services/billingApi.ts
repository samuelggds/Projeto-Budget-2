import { supabase } from "../../auth/services/supabase";
import type { AppRole, AppSubscription, SubscriptionInvoice } from "../types/Billing";

const text = (value: unknown) => String(value ?? "");

function mapSubscription(row: Record<string, unknown>): AppSubscription {
  return {
    id: text(row.id),
    status: text(row.status) as AppSubscription["status"],
    monthlyAmount: Number(row.monthly_amount ?? 250),
    billingEnabled: Boolean(row.billing_enabled),
    activatedAt: row.activated_at ? text(row.activated_at) : undefined,
    currentPeriodStartedAt: row.current_period_started_at ? text(row.current_period_started_at) : undefined,
    currentPeriodEndsAt: row.current_period_ends_at ? text(row.current_period_ends_at) : undefined,
    gracePeriodEndsAt: row.grace_period_ends_at ? text(row.grace_period_ends_at) : undefined,
    blockedAt: row.blocked_at ? text(row.blocked_at) : undefined,
    deactivatedAt: row.deactivated_at ? text(row.deactivated_at) : undefined,
    lastPaymentAt: row.last_payment_at ? text(row.last_payment_at) : undefined,
  };
}

function mapInvoice(row: Record<string, unknown>): SubscriptionInvoice {
  return {
    id: text(row.id), externalReference: text(row.external_reference),
    status: text(row.status) as SubscriptionInvoice["status"], amount: Number(row.amount),
    dueAt: text(row.due_at), gracePeriodEndsAt: text(row.grace_period_ends_at),
    pixQrCode: row.pix_qr_code ? text(row.pix_qr_code) : undefined,
    pixQrCodeBase64: row.pix_qr_code_base64 ? text(row.pix_qr_code_base64) : undefined,
    pixTicketUrl: row.pix_ticket_url ? text(row.pix_ticket_url) : undefined,
    pixExpiresAt: row.pix_expires_at ? text(row.pix_expires_at) : undefined,
    paidAt: row.paid_at ? text(row.paid_at) : undefined,
    createdAt: text(row.created_at),
  };
}

export async function loadCurrentRole(): Promise<AppRole> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão inválida");
  const { data, error } = await supabase.from("app_user_roles").select("role").eq("user_id", userData.user.id).single();
  if (error || !data?.role) throw new Error("Esta conta ainda não possui uma função cadastrada");
  return data.role as AppRole;
}

export async function loadBilling() {
  const [subscriptionResult, invoicesResult] = await Promise.all([
    supabase.from("app_subscription").select("*").eq("id", "main").single(),
    supabase.from("subscription_invoices").select("*").order("created_at", { ascending: false }).limit(24),
  ]);
  if (subscriptionResult.error) throw subscriptionResult.error;
  if (invoicesResult.error) throw invoicesResult.error;
  return {
    subscription: mapSubscription(subscriptionResult.data as Record<string, unknown>),
    invoices: (invoicesResult.data ?? []).map((row) => mapInvoice(row as Record<string, unknown>)),
  };
}

async function invoke(name: string) {
  const { data, error } = await supabase.functions.invoke(name, { body: {} });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export const activateSubscription = () => invoke("activate-subscription");
export const deactivateSubscription = () => invoke("deactivate-subscription");
export const refreshSubscriptionCharge = () => invoke("subscription-maintenance");

export function subscriptionAllowsAccess(subscription: AppSubscription) {
  if (!subscription.billingEnabled || !["ACTIVE", "GRACE"].includes(subscription.status)) return false;
  if (!subscription.gracePeriodEndsAt) return false;
  return Date.now() <= new Date(subscription.gracePeriodEndsAt).getTime();
}

