import { useEffect, useState } from "react";
import { supabase } from "../../auth/services/supabase";
import { activateSubscription, deactivateSubscription, loadBilling, refreshSubscriptionCharge } from "../services/billingApi";
import type { AppSubscription, SubscriptionInvoice } from "../types/Billing";
import { BillingOverview } from "./BillingOverview";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value?: string) => value ? new Date(value).toLocaleString("pt-BR") : "—";

export function BillingPanel() {
  const [subscription, setSubscription] = useState<AppSubscription | null>(null);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const data = await loadBilling();
    setSubscription(data.subscription); setInvoices(data.invoices);
  };

  useEffect(() => { refresh().catch((error: Error) => setMessage(error.message)).finally(() => setLoading(false)); }, []);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setWorking(true); setMessage("");
    try {
      const result = await action() as { message?: string } | undefined;
      await refresh();
      setMessage(result?.message || success);
    }
    catch (error) { setMessage((error as Error).message); }
    finally { setWorking(false); }
  };

  if (loading || !subscription) return <div className="auth-loading"><span>Carregando mensalidade...</span></div>;
  const pending = invoices.find((invoice) => invoice.status === "PENDING");

  return <main className="billing-page">
    <header className="billing-topbar"><div><p>GESTÃO DE COBRANÇA</p><h1>Mensalidade</h1><span>Controle exclusivo da conta de cobrança</span></div><button className="button ghost" onClick={() => void supabase.auth.signOut({ scope: "local" })}>Sair</button></header>
    <section className="billing-grid">
      <article className="card billing-status-card">
        <div className="billing-card-title"><div><span>Situação atual</span><h2>{subscription.status}</h2></div><em className={`billing-badge ${subscription.status.toLowerCase()}`}>{subscription.billingEnabled ? "Recorrência ligada" : "Recorrência desligada"}</em></div>
        <div className="billing-dates"><div><span>Valor mensal</span><strong>{money(subscription.monthlyAmount)}</strong></div><div><span>Ativada em</span><strong>{date(subscription.activatedAt)}</strong></div><div><span>Próximo vencimento</span><strong>{date(subscription.currentPeriodEndsAt)}</strong></div><div><span>Fim da tolerância</span><strong>{date(subscription.gracePeriodEndsAt)}</strong></div></div>
        <div className="billing-actions">
          {!subscription.billingEnabled && <button className="button primary" disabled={working} onClick={() => void run(activateSubscription, "Mensalidade ativada")}>Ativar mensalidade</button>}
          {subscription.billingEnabled && <button className="button danger" disabled={working} onClick={() => window.confirm("Desativar e bloquear o sistema imediatamente?") && void run(deactivateSubscription, "Mensalidade desativada e sistema bloqueado")}>Desativar mensalidade</button>}
          {subscription.billingEnabled && <button className="button soft" disabled={working} onClick={() => void run(refreshSubscriptionCharge, "Cobrança atualizada")}>Atualizar cobrança</button>}
        </div>
        {message && <div className="billing-message">{message}</div>}
      </article>

      <article className="card pix-card">
        <div><span>PIX DO CICLO ATUAL</span><h2>{pending ? money(pending.amount) : "Nenhuma cobrança pendente"}</h2></div>
        {pending?.pixQrCodeBase64 && <img src={`data:image/png;base64,${pending.pixQrCodeBase64}`} alt="QR Code Pix" />}
        {pending?.pixQrCode && <><textarea readOnly value={pending.pixQrCode} /><button className="button primary" onClick={() => void navigator.clipboard.writeText(pending.pixQrCode ?? "")}>Copiar Pix</button></>}
        {pending?.pixTicketUrl && <a className="button soft" href={pending.pixTicketUrl} target="_blank" rel="noreferrer">Abrir no Mercado Pago</a>}
        {!pending && <p>O Pix será criado automaticamente quando o ciclo mensal vencer.</p>}
      </article>
    </section>
    <section className="card billing-history"><div className="registry-title"><div><h2>Histórico de mensalidades</h2><p>Últimas 24 cobranças</p></div></div><div className="billing-table"><div className="billing-row head"><span>Referência</span><span>Valor</span><span>Vencimento</span><span>Status</span><span>Pagamento</span></div>{invoices.map((invoice) => <div className="billing-row" key={invoice.id}><strong>{invoice.externalReference}</strong><span>{money(invoice.amount)}</span><span>{date(invoice.dueAt)}</span><em>{invoice.status}</em><span>{date(invoice.paidAt)}</span></div>)}{!invoices.length && <div className="empty-history">Nenhuma mensalidade gerada.</div>}</div></section>
  </main>;
}

export function SubscriptionBlocked({ subscription }: { subscription: AppSubscription }) {
  return <main className="billing-page blocked-billing-page"><header className="billing-topbar"><div><p>MG ORÇAMENTOS</p><h1>Mensalidade</h1><span>{subscription.status === "INACTIVE" ? "A mensalidade foi desativada." : "O prazo de pagamento terminou."}</span></div><button className="button ghost" onClick={() => void supabase.auth.signOut({ scope: "local" })}>Sair</button></header><BillingOverview blocked /></main>;
}
