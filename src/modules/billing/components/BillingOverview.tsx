import { useEffect, useState } from "react";
import { supabase } from "../../auth/services/supabase";
import { loadBilling, refreshSubscriptionCharge } from "../services/billingApi";
import type { AppSubscription, SubscriptionInvoice } from "../types/Billing";

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value?: string) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

export function BillingOverview({ blocked = false }: { blocked?: boolean }) {
  const [subscription, setSubscription] = useState<AppSubscription | null>(
    null,
  );
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [visibleInvoiceCount, setVisibleInvoiceCount] = useState(5);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await loadBilling();
      setSubscription(data.subscription);
      setInvoices(data.invoices);
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`billing-overview-${crypto.randomUUID()}`)
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
  const pending = invoices.find((invoice) => invoice.status === "PENDING");
  const visibleInvoices = invoices.slice(0, visibleInvoiceCount);
  const hasMoreInvoices = visibleInvoiceCount < invoices.length;

  useEffect(() => {
    if (!subscription?.billingEnabled || !subscription.currentPeriodEndsAt)
      return;
    let cancelled = false;
    let timer = 0;
    const schedule = () => {
      const dueIn =
        new Date(subscription.currentPeriodEndsAt as string).getTime() -
        Date.now();
      const delay = pending
        ? 10_000
        : Math.min(Math.max(dueIn, 1_000), 60 * 60 * 1_000);
      timer = window.setTimeout(async () => {
        try {
          await refreshSubscriptionCharge();
          await refresh();
        } catch {
          // O próximo ciclo tenta novamente; a tela continua disponível para pagamento.
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
    pending,
  ]);

  if (loading && !subscription)
    return (
      <div className="billing-inline-loading">Carregando mensalidade...</div>
    );
  if (!subscription)
    return (
      <div className="billing-message">
        {message || "Não foi possível carregar a mensalidade."}
      </div>
    );

  return (
    <div className={`billing-overview ${blocked ? "is-blocked" : ""}`}>
      {blocked && (
        <div className="billing-block-alert">
          <strong>Acesso administrativo bloqueado</strong>
          <span>
            Pague a mensalidade pendente. A liberação ocorrerá automaticamente
            após a confirmação do Mercado Pago.
          </span>
        </div>
      )}
      <section className="billing-grid">
        <article className="card billing-status-card">
          <div className="billing-card-title">
            <div>
              <span>Situação da mensalidade</span>
              <h2>{subscription.status}</h2>
            </div>
            <em
              className={`billing-badge ${subscription.status.toLowerCase()}`}
            >
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
          <button className="button soft" onClick={() => void refresh()}>
            Atualizar informações
          </button>
          {message && <div className="billing-message">{message}</div>}
        </article>
        <article className="card pix-card">
          <div>
            <span>PIX DO CICLO ATUAL</span>
            <h2>
              {pending ? money(pending.amount) : "Nenhuma cobrança pendente"}
            </h2>
          </div>
          {pending?.pixQrCodeBase64 && (
            <img
              src={`data:image/png;base64,${pending.pixQrCodeBase64}`}
              alt="QR Code Pix"
            />
          )}
          {pending?.pixQrCode && (
            <>
              <textarea readOnly value={pending.pixQrCode} />
              <button
                className="button primary"
                onClick={() =>
                  void navigator.clipboard.writeText(pending.pixQrCode ?? "")
                }
              >
                Copiar Pix
              </button>
            </>
          )}
          {pending?.pixTicketUrl && (
            <a
              className="button soft"
              href={pending.pixTicketUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir no Mercado Pago
            </a>
          )}
          {!pending && (
            <p>
              A cobrança Pix aparecerá aqui automaticamente quando o ciclo
              mensal vencer.
            </p>
          )}
        </article>
      </section>
      <section className="card billing-history">
        <div className="registry-title">
          <div>
            <h2>Faturas da mensalidade</h2>
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
            <div className="empty-history">
              Nenhuma fatura gerada até o momento.
            </div>
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
    </div>
  );
}
