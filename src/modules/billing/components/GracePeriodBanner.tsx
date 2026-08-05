import { useEffect, useState } from "react";
import { supabase } from "../../auth/services/supabase";
import { loadBilling, refreshSubscriptionCharge } from "../services/billingApi";
import type { AppSubscription, SubscriptionInvoice } from "../types/Billing";

interface Props {
  onPayClick: () => void;
  showPayButton?: boolean;
}

export function GracePeriodBanner({ onPayClick, showPayButton = true }: Props) {
  const [subscription, setSubscription] = useState<AppSubscription | null>(
    null,
  );
  const [invoice, setInvoice] = useState<SubscriptionInvoice | null>(null);
  const [generating, setGenerating] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = async () => {
    const data = await loadBilling();
    setSubscription(data.subscription);
    setInvoice(data.invoices.find((inv) => inv.status === "PENDING") ?? null);
  };

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`grace-banner-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_subscription" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscription_invoices" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Poll every 5 minutes to keep days countdown accurate
  useEffect(() => {
    if (subscription?.status !== "GRACE") return;
    const interval = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 5 * 60_000);
    return () => clearInterval(interval);
  }, [subscription?.status]);

  if (
    !subscription ||
    subscription.status !== "GRACE" ||
    !subscription.gracePeriodEndsAt
  )
    return null;

  const daysLeft = Math.ceil(
    (new Date(subscription.gracePeriodEndsAt).getTime() - now) / 86_400_000,
  );
  if (daysLeft < 0) return null;

  const handlePay = async () => {
    if (invoice?.pixTicketUrl) {
      window.open(invoice.pixTicketUrl, "_blank", "noreferrer");
      onPayClick();
      return;
    }
    setGenerating(true);
    try {
      await refreshSubscriptionCharge();
      await refresh();
    } finally {
      setGenerating(false);
    }
    onPayClick();
  };

  return (
    <div className="grace-period-banner">
      <div className="grace-period-banner-inner">
        <span className="grace-period-banner-icon" aria-hidden="true">
          ⚠
        </span>
        <div className="grace-period-banner-text">
          <strong>Fatura vencida</strong>
          <span>
            {daysLeft === 0
              ? "Último dia — o acesso será bloqueado hoje se a fatura não for paga."
              : `Falt${daysLeft === 1 ? "a" : "am"} ${daysLeft} dia${daysLeft !== 1 ? "s" : ""} para o bloqueio. Pague a mensalidade para manter o acesso.`}
          </span>
        </div>
        {showPayButton && (
          <button
            className="button primary grace-period-banner-btn"
            onClick={() => void handlePay()}
            disabled={generating}
          >
            {generating ? "Gerando cobrança..." : "Pagar fatura"}
          </button>
        )}
      </div>
    </div>
  );
}
