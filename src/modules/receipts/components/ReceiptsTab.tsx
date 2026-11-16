import { useEffect, useRef, useState } from "react";
import type { Ref } from "react";
import type { Receipt } from "../types/Receipt";
import {
  loadReceipts,
  markReceiptMigrated,
  migratedReceiptIds,
  nextReceiptNumber,
} from "../services/receiptStorage";
import {
  deleteReceiptFromDatabase,
  importLocalReceipt,
  listReceipts,
  saveReceiptToDatabase,
} from "../services/receiptApi";
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

function ReceiptPaper({ receipt: draft, paperRef }: { receipt: Receipt; paperRef?: Ref<HTMLDivElement> }) {
  const formattedDate = (() => {
    if (!draft.date) return "";
    const [y, m, d] = draft.date.split("-");
    return `${d}/${m}/${y}`;
  })();
  return (
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
  );
}

export function ReceiptsTab() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [draft, setDraft] = useState<Receipt>(() => emptyDraft([]));
  const [preview, setPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyPdf, setHistoryPdf] = useState<Receipt | null>(null);
  const historyPaperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const loadAndMigrate = async () => {
      try {
        const existing = await listReceipts();
        const local = loadReceipts();
        const presentIds = new Set(existing.map((r) => r.id));
        const migrated = migratedReceiptIds();
        let imported = 0;
        let failed = 0;
        for (const receipt of local) {
          if (!receipt.id || migrated.has(receipt.id)) continue;
          if (presentIds.has(receipt.id)) {
            markReceiptMigrated(receipt.id);
            continue;
          }
          try {
            const saved = await importLocalReceipt(receipt);
            presentIds.add(saved.id);
            markReceiptMigrated(receipt.id);
            imported++;
          } catch (reason) {
            // Keep every original in localStorage for future retry.
            failed++;
            console.error("[Recibos] Falha ao importar recibo antigo", reason);
          }
        }
        const result = imported ? await listReceipts() : existing;
        if (!active) return;
        setReceipts(result);
        setDraft(emptyDraft(result));
        if (imported) setNotice(`${imported} recibo(s) antigo(s) recuperado(s) e salvo(s) no histórico.`);
        if (failed) setError(`${failed} recibo(s) local(is) não foram importado(s). Eles continuam preservados neste dispositivo. Reabra a aba para tentar novamente.`);
      } catch (reason) {
        if (active) setError(`Não foi possível carregar o histórico: ${(reason as Error).message}. Verifique se receipts-migration.sql foi executada no Supabase.`);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadAndMigrate();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!historyPdf) return;
    let active = true;
    const generate = async () => {
      setDownloading(true);
      try {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        if (!historyPaperRef.current) throw new Error("Modelo de recibo não encontrado");
        const pdf = await createBudgetPdf(historyPaperRef.current, `recibo-${historyPdf.number}.pdf`);
        await pdf.download();
        if (active) setNotice("PDF baixado com sucesso.");
      } catch (reason) {
        if (active) setError(`Não foi possível baixar o PDF: ${(reason as Error).message}`);
      } finally {
        if (active) {
          setDownloading(false);
          setHistoryPdf(null);
        }
      }
    };
    void generate();
    return () => { active = false; };
  }, [historyPdf]);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(5);
  const paperRef = useRef<HTMLDivElement>(null);

  const update = (field: keyof Receipt, value: string | number) =>
    setDraft((d) => ({ ...d, [field]: value }));

  const saveReceipt = async () => {
    if (busy) return;
    if (!Number.isFinite(draft.amount) || draft.amount <= 0 || !draft.receivedFrom.trim() || !draft.date) {
      setError("Informe valor, nome de quem pagou e data.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const persisted = await saveReceiptToDatabase(draft);
      const updated = await listReceipts();
      setReceipts(updated);
      setDraft(emptyDraft(updated));
      setPreview(false);
      setNotice(`Recibo Nº ${persisted.number} salvo no histórico.`);
    } catch (reason) {
      setError(`Não foi possível salvar o recibo: ${(reason as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteReceipt = async (id: string) => {
    if (busy || !window.confirm("Excluir este recibo do histórico?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await deleteReceiptFromDatabase(id);
      // Do not resurrect a deleted receipt from its preserved legacy backup.
      markReceiptMigrated(id);
      const updated = await listReceipts();
      setReceipts(updated);
      if (draft.id === id) {
        setDraft(emptyDraft(updated));
        setPreview(false);
      }
      setNotice("Recibo excluído.");
    } catch (reason) {
      setError(`Não foi possível excluir o recibo: ${(reason as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const editReceipt = (receipt: Receipt) => {
    setDraft(receipt);
    setPreview(false);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const downloadPdf = async () => {
    if (!paperRef.current || downloading) return;
    setDownloading(true);
    setError("");
    try {
      const pdf = await createBudgetPdf(paperRef.current, `recibo-${draft.number}.pdf`);
      await pdf.download();
      setNotice("PDF baixado com sucesso.");
    } catch (reason) {
      setError(`Não foi possível baixar o PDF: ${(reason as Error).message}`);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="card registry-empty">Carregando histórico e recuperando recibos antigos...</div>;
  if (error.startsWith("Não foi possível carregar o histórico:")) {
    return <div className="card registry-empty" role="alert">
      <p>{error}</p>
      <button className="button primary" onClick={() => window.location.reload()}>Tentar novamente</button>
    </div>;
  }

  return (
    <div className="registry-layout">
      {error && <p className="registry-empty" role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {notice && <p className="registry-empty" role="status">{notice}</p>}
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
              onClick={() => void saveReceipt()}
              disabled={busy || downloading}
            >
              {busy ? "Salvando..." : "💾 Salvar sem visualizar"}
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
              <button className="button ghost" disabled={busy || downloading} onClick={() => void saveReceipt()}>
                {busy ? "Salvando..." : "💾 Salvar recibo"}
              </button>
              <button
                className="button primary"
                onClick={() => void downloadPdf()}
                disabled={downloading || busy}
              >
                {downloading ? "Gerando..." : "↧ Baixar PDF (A4)"}
              </button>
            </div>
          </div>

          <ReceiptPaper receipt={draft} paperRef={paperRef} />
        </div>
      )}

      {/* ── LIST ─────────────────────────────────── */}
      <div className="card registry-list">
        <div className="registry-title">
          <h2>Recibos emitidos</h2>
        </div>
        <label style={{ display: "block", marginBottom: 12 }}>
          <input
            placeholder="Pesquisar por Nº do recibo..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(5);
            }}
            style={{ width: "100%" }}
          />
        </label>
        {(() => {
          const filtered = receipts
            .slice()
            .filter(
              (r) =>
                !search.trim() ||
                r.number.toLowerCase().includes(search.trim().toLowerCase()),
            );
          const visible = filtered.slice(0, visibleCount);
          if (receipts.length === 0)
            return <p className="registry-empty">Nenhum recibo emitido.</p>;
          if (filtered.length === 0)
            return (
              <p className="registry-empty">
                Nenhum recibo encontrado para "{search}".
              </p>
            );
          return (
            <>
              {visible.map((r) => (
                <div className="registry-row" key={r.id}>
                  <div>
                    <strong>Recibo Nº {r.number}</strong>
                    <small>
                      {r.receivedFrom || "—"} · {formatMoney(r.amount)}
                      {r.referringTo ? ` · ${r.referringTo}` : ""}
                    </small>
                  </div>
                  <div className="receipt-list-actions">
                    <button disabled={busy || downloading} onClick={() => editReceipt(r)}>Editar</button>
                    <button disabled={busy || downloading} onClick={() => { setError(""); setNotice(""); setHistoryPdf(r); }}>Baixar PDF</button>
                    <button
                      disabled={busy || downloading}
                      className="delete-service"
                      onClick={() => void deleteReceipt(r.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length > 5 && (
                <div className="load-controls">
                  <span>
                    Exibindo {Math.min(visibleCount, filtered.length)} de{" "}
                    {filtered.length}
                  </span>
                  {visibleCount > 5 && (
                    <button
                      className="button ghost"
                      onClick={() => setVisibleCount(5)}
                    >
                      ← Voltar ao início
                    </button>
                  )}
                  {visibleCount < filtered.length && (
                    <button
                      className="button primary"
                      onClick={() => setVisibleCount((c) => c + 5)}
                    >
                      Carregar mais 5
                    </button>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>
      {historyPdf && (
        <div style={{ position: "fixed", left: "-12000px", top: 0, width: "210mm", pointerEvents: "none" }} aria-hidden="true">
          <ReceiptPaper receipt={historyPdf} paperRef={historyPaperRef} />
        </div>
      )}
    </div>
  );
}
