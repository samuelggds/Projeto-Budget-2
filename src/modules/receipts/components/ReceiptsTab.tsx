import { useRef, useState } from "react";
import type { Receipt } from "../types/Receipt";
import {
  loadReceipts,
  nextReceiptNumber,
  saveReceipts,
} from "../services/receiptStorage";
import { createBudgetPdf } from "../../pdf/services/budgetPdf";

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function emptyDraft(receipts: Receipt[]): Receipt {
  return {
    id: "",
    number: nextReceiptNumber(receipts),
    amount: 0,
    receivedFrom: "",
    amountDescription: "",
    referringTo: "",
    city: "",
    date: new Date().toISOString().slice(0, 10),
    signerName: "",
    signerDocument: "",
    createdAt: "",
  };
}

export function ReceiptsTab() {
  const [receipts, setReceipts] = useState<Receipt[]>(() => loadReceipts());
  const [draft, setDraft] = useState<Receipt>(() => emptyDraft(loadReceipts()));
  const [preview, setPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  const update = (field: keyof Receipt, value: string | number) =>
    setDraft((d) => ({ ...d, [field]: value }));

  const saveReceipt = () => {
    const now = new Date().toISOString();
    const updated = draft.id
      ? receipts.map((r) =>
          r.id === draft.id ? { ...draft, createdAt: r.createdAt } : r,
        )
      : [...receipts, { ...draft, id: crypto.randomUUID(), createdAt: now }];
    setReceipts(updated);
    saveReceipts(updated);
    setDraft(emptyDraft(updated));
    setPreview(false);
  };

  const deleteReceipt = (id: string) => {
    const updated = receipts.filter((r) => r.id !== id);
    setReceipts(updated);
    saveReceipts(updated);
  };

  const editReceipt = (r: Receipt) => {
    setDraft(r);
    setPreview(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const downloadPdf = async () => {
    if (!paperRef.current) return;
    setDownloading(true);
    try {
      const pdf = await createBudgetPdf(
        paperRef.current,
        `recibo-${draft.number}.pdf`,
      );
      pdf.download();
    } finally {
      setDownloading(false);
    }
  };

  const formattedDate = (() => {
    if (!draft.date) return "";
    const [y, m, d] = draft.date.split("-");
    return `${d}/${m}/${y}`;
  })();

  return (
    <div className="registry-layout">
      {/* ── FORM ─────────────────────────────────── */}
      {!preview && (
        <div className={`card registry-form ${draft.id ? "is-editing" : ""}`}>
          <div className="section-title">
            <span>✎</span>
            <div>
              <h2>{draft.id ? "Editar recibo" : "Novo recibo"}</h2>
              <p>Preencha os dados e visualize antes de baixar o PDF</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Nº do recibo
              <input value={draft.number} readOnly aria-readonly="true" />
            </label>
            <label>
              Valor (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={draft.amount || ""}
                onChange={(e) => update("amount", Number(e.target.value))}
              />
            </label>
            <label className="full">
              Recebi(emos) de
              <input
                placeholder="Nome completo ou razão social de quem pagou"
                value={draft.receivedFrom}
                onChange={(e) => update("receivedFrom", e.target.value)}
              />
            </label>
            <label className="full">
              A importância de
              <input
                placeholder="Ex.: duzentos reais"
                value={draft.amountDescription}
                onChange={(e) => update("amountDescription", e.target.value)}
              />
            </label>
            <label className="full">
              Referente a
              <input
                placeholder="Ex.: serviço de manutenção de ar-condicionado"
                value={draft.referringTo}
                onChange={(e) => update("referringTo", e.target.value)}
              />
            </label>
            <label>
              Cidade
              <input
                placeholder="Ex.: Fortaleza"
                value={draft.city}
                onChange={(e) => update("city", e.target.value)}
              />
            </label>
            <label>
              Data
              <input
                type="date"
                value={draft.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </label>
            <label className="wide">
              Nome do emissor (para assinatura)
              <input
                placeholder="Seu nome completo"
                value={draft.signerName}
                onChange={(e) => update("signerName", e.target.value)}
              />
            </label>
            <label>
              CPF / CNPJ do emissor
              <input
                placeholder="000.000.000-00"
                value={draft.signerDocument}
                onChange={(e) => update("signerDocument", e.target.value)}
              />
            </label>
          </div>

          <div className="receipt-form-actions">
            <button
              className="button primary registry-save"
              onClick={() => setPreview(true)}
            >
              👁 Visualizar recibo
            </button>
            <button
              className="button ghost registry-save"
              onClick={saveReceipt}
            >
              💾 Salvar sem visualizar
            </button>
            {draft.id && (
              <button
                className="button ghost"
                onClick={() => {
                  setDraft(emptyDraft(receipts));
                  setPreview(false);
                }}
              >
                Cancelar edição
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── A4 PREVIEW ───────────────────────────── */}
      {preview && (
        <div className="receipt-preview-area">
          <div className="receipt-preview-toolbar">
            <button className="button ghost" onClick={() => setPreview(false)}>
              ← Voltar ao formulário
            </button>
            <div className="receipt-preview-actions">
              <button className="button ghost" onClick={saveReceipt}>
                💾 Salvar recibo
              </button>
              <button
                className="button primary"
                onClick={downloadPdf}
                disabled={downloading}
              >
                {downloading ? "Gerando..." : "↧ Baixar PDF (A4)"}
              </button>
            </div>
          </div>

          {/* Receipt paper — sized to A4 for PDF capture */}
          <div ref={paperRef} className="receipt-paper">
            <div className="receipt-a4-inner">
              <div className="receipt-box">
                {/* Header */}
                <div className="receipt-header">
                  <h1 className="receipt-title">RECIBO</h1>
                  <div className="receipt-header-right">
                    <div className="receipt-number-box">
                      <span>Nº:</span>
                      <strong>{draft.number}</strong>
                    </div>
                    <div className="receipt-value-box">
                      <span>VALOR:</span>
                      <strong>{formatMoney(draft.amount)}</strong>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="receipt-body">
                  <div className="receipt-field-row">
                    <span className="receipt-label">Recebi(emos) de</span>
                    <span className="receipt-line">{draft.receivedFrom}</span>
                  </div>
                  <div className="receipt-field-row">
                    <span className="receipt-label">a importância de</span>
                    <span className="receipt-line">
                      {draft.amountDescription}
                    </span>
                  </div>
                  <div className="receipt-field-row">
                    <span className="receipt-label">referente a</span>
                    <span className="receipt-line">{draft.referringTo}</span>
                  </div>

                  <p className="receipt-clause">
                    e para clareza firmo(amos) o presente
                  </p>

                  <div className="receipt-location-row">
                    <span className="receipt-line receipt-city">
                      {draft.city || "\u00a0"}
                    </span>
                    <span className="receipt-comma">,</span>
                    <span className="receipt-line receipt-date">
                      {formattedDate || "\u00a0"}
                    </span>
                  </div>

                  <div className="receipt-signature-area">
                    <div className="receipt-sig-line" />
                    <p className="receipt-field-pair">
                      <span>
                        <span className="receipt-label">Assinatura:</span>
                        <span className="receipt-sig-underline" />
                      </span>
                    </p>
                    <p className="receipt-field-pair receipt-name-doc">
                      <span>
                        <span className="receipt-label">Nome:</span>
                        <span className="receipt-sig-underline receipt-name-line">
                          {draft.signerName}
                        </span>
                      </span>
                      <span>
                        <span className="receipt-label">CPF/CNPJ:</span>
                        <span className="receipt-sig-underline">
                          {draft.signerDocument}
                        </span>
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LIST ─────────────────────────────────── */}
      <div className="card registry-list">
        <h2>Recibos emitidos</h2>
        {receipts.length === 0 ? (
          <p className="registry-empty">Nenhum recibo emitido.</p>
        ) : (
          receipts
            .slice()
            .reverse()
            .map((r) => (
              <div className="registry-row" key={r.id}>
                <div>
                  <strong>Recibo Nº {r.number}</strong>
                  <small>
                    {r.receivedFrom || "—"} · {formatMoney(r.amount)}
                    {r.referringTo ? ` · ${r.referringTo}` : ""}
                  </small>
                </div>
                <div className="receipt-list-actions">
                  <button onClick={() => editReceipt(r)}>Editar</button>
                  <button
                    className="delete-service"
                    onClick={() => deleteReceipt(r.id)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
