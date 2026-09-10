import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../auth/services/supabase";
import {
  activateSubscription,
  deactivateSubscription,
  loadBilling,
  refreshSubscriptionCharge,
} from "../services/billingApi";
import type { AppSubscription, SubscriptionInvoice } from "../types/Billing";
import { BillingOverview } from "./BillingOverview";
import { usePublicBrand } from "../../settings/services/publicBrand";

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value?: string) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

export function BillingPanel() {
  const brand = usePublicBrand();
  const [subscription, setSubscription] = useState<AppSubscription | null>(null);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [visibleInvoiceCount, setVisibleInvoiceCount] = useState(5);
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const data = await loadBilling();
    setSubscription(data.subscription);
    setInvoices(data.invoices);
    setCurrentTime(Date.now());
  }, []);

  useEffect(() => {
    refresh()
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`billing-panel-${crypto.randomUUID()}`)
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
  }, [refresh]);

  const pending = invoices.find((invoice) => invoice.status === "PENDING");
  const pendingId = pending?.id;
  const pendingPixExpiresAt = pending?.pixExpiresAt;
  const pendingPixExpired = Boolean(
    pendingPixExpiresAt &&
      currentTime !== null &&
      new Date(pendingPixExpiresAt).getTime() <= currentTime,
  );
  const pendingPixMissing = Boolean(
    pending && (!pending.pixQrCode || !pending.pixQrCodeBase64),
  );
  const payablePending =
    pending && !pendingPixExpired && !pendingPixMissing ? pending : undefined;

  useEffect(() => {
    if (!subscription?.billingEnabled || !subscription.currentPeriodEndsAt)
      return;

    let cancelled = false;
    let timer = 0;
    const currentPeriodEndsAt = subscription.currentPeriodEndsAt;

    const schedule = () => {
      const dueIn = new Date(currentPeriodEndsAt).getTime() - Date.now();
      const expiresIn = pendingPixExpiresAt
        ? new Date(pendingPixExpiresAt).getTime() - Date.now()
        : Number.POSITIVE_INFINITY;
      const delay = pendingId
        ? Math.min(Math.max(expiresIn, 1_000), 10_000)
        : Math.min(Math.max(dueIn, 1_000), 60 * 60 * 1_000);

      timer = window.setTimeout(async () => {
        try {
          await refreshSubscriptionCharge();
          await refresh();
        } catch (error) {
          setMessage((error as Error).message);
        }
        if (!cancelled) schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    subscription?.billingEnabled,
    subscription?.currentPeriodEndsAt,
    pendingId,
    pendingPixExpiresAt,
    refresh,
  ]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setWorking(true);
    setMessage("");
    try {
      const result = (await action()) as { message?: string } | undefined;
      await refresh();
      setMessage(result?.message || success);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(false);
    }
  };

  if (loading || !subscription)
    return (
      <div className="auth-loading">
        <span>Carregando mensalidade...</span>
      </div>
    );

  const visibleInvoices = invoices.slice(0, visibleInvoiceCount);
  const hasMoreInvoices = visibleInvoiceCount < invoices.length;

  return (
    <main className="billing-page">
      <header className="billing-topbar">
        <div className="billing-brand-heading">
          <img
            src={brand.logoDataUrl || "/logo-placeholder.svg"}
            alt={`Logo de ${brand.companyName}`}
          />
          <div>
            <p>{brand.appName.toUpperCase()}</p>
            <h1>Mensalidade</h1>
            <span>{brand.companyName} · controle da conta de cobrança</span>
          </div>
        </div>
        <button
          className="button ghost"
          onClick={() => void supabase.auth.signOut({ scope: "local" })}
        >
          Sair
        </button>
      </header>

      <section className="billing-grid">
        <article className="card billing-status-card">
          <div className="billing-card-title">
            <div>
              <span>Situação atual</span>
              <h2>{subscription.status}</h2>
            </div>
            <em className={`billing-badge ${subscription.status.toLowerCase()}`}>
              {subscription.billingEnabled
                ? "Recorrência ligada"
                : "Recorrência desligada"}
            </em>
          </div>

          <div className="billing-dates">
            <div>
              <span>Valor mensal</span>
              <strong>{money(subscription.monthlyAmount)}</strong>
            </div>
            <div>
              <span>Ativada em</span>
              <strong>{date(subscription.activatedAt)}</strong>
            </div>
            <div>
              <span>Próximo vencimento</span>
              <strong>{date(subscription.currentPeriodEndsAt)}</strong>
            </div>
            <div>
              <span>Fim da tolerância</span>
              <strong>{date(subscription.gracePeriodEndsAt)}</strong>
            </div>
          </div>

          <div className="billing-actions">
            {!subscription.billingEnabled && (
              <button
                className="button primary"
                disabled={working}
                onClick={() =>
                  void run(activateSubscription, "Mensalidade ativada")
                }
              >
                Ativar mensalidade
              </button>
            )}

            {subscription.billingEnabled && (
              <button
                className="button danger"
                disabled={working}
                onClick={() =>
                  window.confirm(
                    "Desativar e bloquear o sistema imediatamente?",
                  ) &&
                  void run(
                    deactivateSubscription,
                    "Mensalidade desativada e sistema bloqueado",
                  )
                }
              >
                Desativar mensalidade
              </button>
            )}

            {subscription.billingEnabled && (
              <button
                className="button soft"
                disabled={working}
                onClick={() =>
                  void run(refreshSubscriptionCharge, "Cobrança atualizada")
                }
              >
                Atualizar cobrança
              </button>
            )}
          </div>

          {message && <div className="billing-message">{message}</div>}
        </article>

        <article className="card pix-card">
          <div>
            <span>PIX DO CICLO ATUAL</span>
            <h2>
              {pending ? money(pending.amount) : "Nenhuma cobrança pendente"}
            </h2>
          </div>

          {pendingPixExpired && (
            <p>O PIX anterior expirou. Gere ou atualize a cobrança para receber um novo QR Code.</p>
          )}

          {pendingPixMissing && !pendingPixExpired && (
            <p>A cobrança existe, mas o QR Code ainda não está disponível.</p>
          )}

          {payablePending?.pixQrCodeBase64 && (
            <img
              src={`data:image/png;base64,${payablePending.pixQrCodeBase64}`}
              alt="QR Code Pix"
            />
          )}

          {payablePending?.pixQrCode && (
            <>
              <textarea readOnly value={payablePending.pixQrCode} />
              <button
                className="button primary"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    payablePending.pixQrCode ?? "",
                  )
                }
              >
                Copiar Pix
              </button>
            </>
          )}

          {payablePending?.pixTicketUrl && (
            <a
              className="button soft"
              href={payablePending.pixTicketUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir no Mercado Pago
            </a>
          )}

          {pending && (pendingPixExpired || pendingPixMissing) && (
            <button
              className="button primary"
              type="button"
              disabled={working}
              onClick={() =>
                void run(refreshSubscriptionCharge, "Novo QR Code gerado")
              }
            >
              {working ? "Gerando QR Code..." : "Gerar novo QR Code"}
            </button>
          )}

          {!pending && (
            <p>O Pix será criado automaticamente quando o ciclo mensal vencer.</p>
          )}
        </article>
      </section>

      <section className="card billing-history">
        <div className="registry-title">
          <div>
            <h2>Histórico de mensalidades</h2>
            <p>
              Exibindo {Math.min(visibleInvoiceCount, invoices.length)} de{" "}
              {invoices.length} faturas
            </p>
          </div>
        </div>

        <div className="billing-table">
          <div className="billing-row head">
            <span>Referência</span>
            <span>Valor</span>
            <span>Vencimento</span>
            <span>Status</span>
            <span>Pagamento</span>
          </div>

          {visibleInvoices.map((invoice) => (
            <div className="billing-row" key={invoice.id}>
              <strong>{invoice.externalReference}</strong>
              <span>{money(invoice.amount)}</span>
              <span>{date(invoice.dueAt)}</span>
              <em>{invoice.status}</em>
              <span>{date(invoice.paidAt)}</span>
            </div>
          ))}

          {!invoices.length && (
            <div className="empty-history">Nenhuma mensalidade gerada.</div>
          )}
        </div>

        {invoices.length > 5 && (
          <div className="billing-pagination">
            {hasMoreInvoices && (
              <button
                className="button soft"
                type="button"
                onClick={() =>
                  setVisibleInvoiceCount((count) =>
                    Math.min(count + 5, invoices.length),
                  )
                }
              >
                Carregar mais 5
              </button>
            )}

            {visibleInvoiceCount > 5 && (
              <button
                className="button ghost"
                type="button"
                onClick={() => setVisibleInvoiceCount(5)}
              >
                Voltar para 5
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export function SubscriptionBlocked({
  subscription,
}: {
  subscription: AppSubscription;
}) {
  const brand = usePublicBrand();
  return (
    <main className="billing-page blocked-billing-page">
      <header className="billing-topbar">
        <div className="billing-brand-heading">
          <img
            src={brand.logoDataUrl || "/logo-placeholder.svg"}
            alt={`Logo de ${brand.companyName}`}
          />
          <div>
            <p>{brand.appName.toUpperCase()}</p>
            <h1>Mensalidade</h1>
            <span>
              {subscription.status === "INACTIVE"
                ? "A mensalidade foi desativada."
                : "O prazo de pagamento terminou."}
            </span>
          </div>
        </div>
        <button
          className="button ghost"
          onClick={() => void supabase.auth.signOut({ scope: "local" })}
        >
          Sair
        </button>
      </header>
      <BillingOverview blocked />
    </main>
  );
}
