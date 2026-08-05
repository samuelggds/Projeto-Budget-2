import { useEffect, useRef, useState } from "react";
import { formatMoney as money } from "../../budgets/services/budgetCalculations";
import { createBudgetPdf } from "../services/budgetPdf";

const COUNTS = [5, 10, 15, 20, 25, 30, 35, 40];

function makeItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    description: `Serviço de manutenção preventiva no equipamento ${i + 1}`,
    quantity: 1,
    unit: "un.",
    unitPrice: 50 + i * 10,
    serviceId: i % 3 === 0 ? "s1" : undefined,
    partId: i % 5 === 0 ? "p1" : undefined,
  }));
}

function PaperPreview({
  count,
  onMeasure,
}: {
  count: number;
  onMeasure: (count: number, height: number, a4: number) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const items = makeItems(count);
  const total = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const paperClass = `paper ${count > 19 ? "paper-max" : count > 12 ? "paper-ultra" : count > 7 ? "paper-dense" : ""}`;

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const a4px = Math.ceil((297 / 25.4) * 96);
    onMeasure(count, el.scrollHeight, a4px);
  });

  const handleDownload = async () => {
    if (!ref.current) return;
    const pdf = await createBudgetPdf(ref.current, `teste-${count}-itens.pdf`);
    pdf.download();
  };

  return (
    <div style={{ marginBottom: 40 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
          fontFamily: "sans-serif",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <span>
          {count} itens — classe:{" "}
          {count > 12
            ? "paper-ultra"
            : count > 7
              ? "paper-dense"
              : "paper (normal)"}
        </span>
        <button
          onClick={handleDownload}
          style={{
            padding: "4px 12px",
            background: "#1a3a8f",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ↧ Baixar PDF
        </button>
      </div>
      <div style={{ position: "relative", display: "inline-block" }}>
        {/* A4 boundary indicator */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "210mm",
            height: "297mm",
            border: "2px dashed red",
            pointerEvents: "none",
            zIndex: 10,
            boxSizing: "border-box",
          }}
        />
        <article ref={ref} className={paperClass}>
          <div className="paper-head">
            <img
              src=""
              alt=""
              style={{ width: 80, height: 40, background: "#ddd" }}
            />
            <div>
              <h2>F&amp;A REFRIGERAÇÃO</h2>
              <p>Rua de Teste, 123 · Fortaleza · CE · 60000-000</p>
              <p>Tel. 1: (85) 99999-7788 · Tel. 2: (85) 99988-1234</p>
              <p>CNPJ/CPF 12.345.678/0001-99 · fa@email.com.br</p>
            </div>
            <div className="paper-number">
              <div className="paper-technician">
                <span>TÉCNICO RESPONSÁVEL</span>
                <b>Ferdinando</b>
              </div>
              <span>ORÇAMENTO DE SERVIÇOS E PEÇAS</span>
              <strong>ORC-{String(count).padStart(2, "0")}</strong>
              <small>Emissão: 05/08/2026</small>
            </div>
          </div>
          <div className="paper-client">
            <span>CLIENTE</span>
            <h3>MG Nobre Refrigeração Ltda</h3>
            <div>
              <p>
                <b>CPF/CNPJ:</b> 12.345.678/0001-99
              </p>
              <p>
                <b>Telefone:</b> (85) 99911-2233
              </p>
              <p>
                <b>E-mail:</b> cliente@email.com
              </p>
              <p>
                <b>Contato:</b> Sr. João
              </p>
            </div>
            <p>
              <b>Endereço:</b> Av. Principal, 456 · Fortaleza · CE · 60100-000
            </p>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Qtd.</th>
                <th>Un.</th>
                <th>Valor unit.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td>{String(index + 1).padStart(2, "0")}</td>
                  <td>
                    <span
                      className={`paper-item-type ${item.partId ? "part" : item.serviceId ? "service" : "manual"}`}
                    >
                      {item.partId
                        ? "Peça"
                        : item.serviceId
                          ? "Mão de obra"
                          : "Item manual"}
                    </span>
                  </td>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>un.</td>
                  <td>{money(item.unitPrice)}</td>
                  <td>{money(item.quantity * item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="paper-summary">
            <div>
              <span>CONDIÇÕES COMERCIAIS</span>
              <p>
                <b>Pagamento:</b> Transferência
              </p>
              <p>
                <b>Validade do orçamento:</b> 5 dias após a emissão
              </p>
            </div>
            <div>
              <span>VALOR TOTAL</span>
              <strong>{money(total)}</strong>
            </div>
          </div>
          <div className="paper-notes">
            <span>OBSERVAÇÕES</span>
            <p>Cliente só quer trocar o rele.</p>
          </div>
          <div className="signatures">
            <div />
            <div />
            <p>F&amp;A Refrigeração</p>
            <p>MG Nobre</p>
          </div>
          <footer>
            Obrigado pela preferência. Estamos à disposição para esclarecer
            qualquer dúvida.
          </footer>
        </article>
      </div>
    </div>
  );
}

export function PdfLayoutTest() {
  const [measurements, setMeasurements] = useState<
    Record<number, { height: number; a4: number }>
  >({});

  const handleMeasure = (count: number, height: number, a4: number) => {
    setMeasurements((prev) => {
      if (prev[count]?.height === height) return prev;
      return { ...prev, [count]: { height, a4 } };
    });
  };

  return (
    <div style={{ padding: 32, background: "#f0f2f7", minHeight: "100vh" }}>
      <h1 style={{ fontFamily: "sans-serif", marginBottom: 8 }}>
        Teste de Layout PDF — A4
      </h1>
      <p
        style={{
          fontFamily: "sans-serif",
          fontSize: 13,
          marginBottom: 24,
          color: "#444",
        }}
      >
        A borda vermelha tracejada marca o limite exato de A4 (297mm). Conteúdo
        fora dela será comprimido verticalmente no PDF.
      </p>

      {/* Summary table */}
      <table
        style={{
          fontFamily: "sans-serif",
          fontSize: 12,
          marginBottom: 32,
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr>
            {[
              "Itens",
              "Classe CSS",
              "Altura real (px)",
              "A4 (px)",
              "Excesso (px)",
              "Status",
            ].map((h) => (
              <th
                key={h}
                style={{
                  padding: "6px 14px",
                  background: "#1a3a8f",
                  color: "#fff",
                  textAlign: "left",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COUNTS.map((count) => {
            const m = measurements[count];
            const excess = m ? Math.max(0, m.height - m.a4) : null;
            const ratio = m ? m.height / m.a4 : null;
            const status = !m
              ? "—"
              : excess === 0
                ? "✅ Cabe"
                : excess! < 30
                  ? "⚠️ Marginal"
                  : "❌ Excede";
            return (
              <tr
                key={count}
                style={{ background: count % 2 === 0 ? "#fff" : "#f5f7fb" }}
              >
                <td style={{ padding: "5px 14px" }}>{count}</td>
                <td style={{ padding: "5px 14px", fontFamily: "monospace" }}>
                  {count > 19
                    ? "paper-max"
                    : count > 12
                      ? "paper-ultra"
                      : count > 7
                        ? "paper-dense"
                        : "paper"}
                </td>
                <td style={{ padding: "5px 14px" }}>{m?.height ?? "…"}</td>
                <td style={{ padding: "5px 14px" }}>{m?.a4 ?? "…"}</td>
                <td
                  style={{
                    padding: "5px 14px",
                    color: excess ? "#c00" : "#0a7",
                  }}
                >
                  {excess !== null ? (excess === 0 ? "0" : `+${excess}`) : "…"}
                </td>
                <td style={{ padding: "5px 14px" }}>
                  {status} {ratio ? `(${(ratio * 100).toFixed(0)}%)` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {COUNTS.map((count) => (
        <PaperPreview key={count} count={count} onMeasure={handleMeasure} />
      ))}
    </div>
  );
}
