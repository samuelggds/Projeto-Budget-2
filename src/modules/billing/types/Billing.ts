export type AppRole = "ADMIN" | "BILLING_ADMIN";

export type SubscriptionStatus = "INACTIVE" | "ACTIVE" | "GRACE" | "BLOCKED";

export interface AppSubscription {
  id: string;
  status: SubscriptionStatus;
  monthlyAmount: number;
  billingEnabled: boolean;
  activatedAt?: string;
  currentPeriodStartedAt?: string;
  currentPeriodEndsAt?: string;
  gracePeriodEndsAt?: string;
  blockedAt?: string;
  deactivatedAt?: string;
  lastPaymentAt?: string;
}

export interface SubscriptionInvoice {
  id: string;
  externalReference: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
  amount: number;
  dueAt: string;
  gracePeriodEndsAt: string;
  pixQrCode?: string;
  pixQrCodeBase64?: string;
  pixTicketUrl?: string;
  pixExpiresAt?: string;
  paidAt?: string;
  createdAt: string;
}

