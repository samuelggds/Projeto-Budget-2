import { useEffect, useState } from "react";
import { useSubscription } from "../../auth/context/appAccessContext";

interface Props {
  onPayClick: () => void;
}

export function GracePeriodBanner({ onPayClick }: Props) {
  const subscription = useSubscription();
  const [now, setNow] = useState(() => Date.now());

  // Refresh the timestamp every minute so the day counter stays accurate
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (subscription.status !== "GRACE" || !subscription.gracePeriodEndsAt)
    return null;

  const msLeft = new Date(subscription.gracePeriodEndsAt).getTime() - now;
  if (msLeft <= 0) return null;
  const daysLeft = Math.floor(msLeft / 86_400_000); // complete days remaining; 0 = last day

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
        <button
          className="button primary grace-period-banner-btn"
          onClick={onPayClick}
        >
          Pagar fatura
        </button>
      </div>
    </div>
  );
}
