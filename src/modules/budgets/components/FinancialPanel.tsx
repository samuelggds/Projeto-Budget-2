import { useMemo, useState } from "react";
import type { Budget } from "../types/Budget";
import {
  calculateDiscountTotal,
  calculateFinalTotal,
  formatMoney as money,
} from "../services/budgetCalculations";
import { SmoothSelect } from "../../shared/components/SmoothSelect";

const partsTotal = (b: Budget) =>
  b.items
    .filter((i) => i.partId)
    .reduce((s, i) => s + i.quantity * i.unitPrice, 0);

const servicesTotal = (b: Budget) =>
  b.items
    .filter((i) => !i.partId)
    .reduce((s, i) => s + i.quantity * i.unitPrice, 0);

interface Props {
  saved: Budget[];
}

function monthLabel(yearMonth: string) {
  const [year, month] = yearMonth.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric" },
  );
}

function statusClass(status: string) {
  return status.toLowerCase().replace(/\s+/g, ".");
}

export function FinancialPanel({ saved }: Props) {
  const now = new Date();
  const currentYearMonth = now.toISOString().slice(0, 7);

  const [historySearch, setHistorySearch] = useState("");
  const [historyPeriod, setHistoryPeriod] = useState("todos");
  const [historyMonth, setHistoryMonth] = useState("todos");
  const [historyStatus, setHistoryStatus] = useState("todos");
  const [historyCount, setHistoryCount] = useState(3);
  const [historyView, setHistoryView] = useState<"mensal" | "todos">("mensal");
  const [allCount, setAllCount] = useState(5);
  const [budgetCountByMonth, setBudgetCountByMonth] = useState<
    Record<string, number>
  >({});

  const budgetLimit = (ym: string) => budgetCountByMonth[ym] ?? 5;
  const loadMoreBudgets = (ym: string) =>
    setBudgetCountByMonth((prev) => ({ ...prev, [ym]: (prev[ym] ?? 5) + 5 }));
  const resetBudgets = (ym: string) =>
    setBudgetCountByMonth((prev) => ({ ...prev, [ym]: 5 }));

  const active = useMemo(
    () =>
      saved.filter((b) => b.status !== "Recusado" && b.status !== "Cancelado"),
    [saved],
  );

  // All months that have data — used to populate the month dropdown
  const availableMonths = useMemo(() => {
    const months = new Set(active.map((b) => b.issuedAt.slice(0, 7)));
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [active]);

  const {
    monthlyBudgets,
    monthlyTotal,
    monthlyPaid,
    monthlyParts,
    monthlyServices,
    allTotal,
    allPaid,
    allParts,
    allServices,
    history,
    allBudgets,
  } = useMemo(() => {
    const monthly = active.filter((b) =>
      b.issuedAt.startsWith(currentYearMonth),
    );
    const monthTotal = monthly.reduce(
      (sum, b) => sum + calculateFinalTotal(b),
      0,
    );
    const monthPaid = monthly
      .filter((b) => b.status === "Pago")
      .reduce((sum, b) => sum + calculateFinalTotal(b), 0);
    const monthParts = monthly.reduce((sum, b) => sum + partsTotal(b), 0);
    const monthServices = monthly.reduce((sum, b) => sum + servicesTotal(b), 0);

    const total = active.reduce((sum, b) => sum + calculateFinalTotal(b), 0);
    const paid = active
      .filter((b) => b.status === "Pago")
      .reduce((sum, b) => sum + calculateFinalTotal(b), 0);
    const allParts = active.reduce((sum, b) => sum + partsTotal(b), 0);
    const allServices = active.reduce((sum, b) => sum + servicesTotal(b), 0);

    const periodCutoff =
      historyMonth !== "todos" || historyPeriod === "todos"
        ? null
        : new Date(
            new Date().getFullYear(),
            new Date().getMonth() - (Number(historyPeriod) - 1),
            1,
          )
            .toISOString()
            .slice(0, 7);

    const query = historySearch.trim().toLocaleLowerCase("pt-BR");

    const matchesBudget = (b: Budget) => {
      if (historyStatus !== "todos" && b.status !== historyStatus) return false;
      if (
        query &&
        !b.number.toLocaleLowerCase("pt-BR").includes(query) &&
        !b.client.name.toLocaleLowerCase("pt-BR").includes(query)
      )
        return false;
      return true;
    };

    // Flat list for "todos" view — sorted newest first
    const all = active
      .filter(matchesBudget)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

    const byMonth: Record<
      string,
      { total: number; paid: number; budgets: Budget[] }
    > = {};
    for (const b of active) {
      const ym = b.issuedAt.slice(0, 7);
      if (historyMonth !== "todos" && ym !== historyMonth) continue;
      if (periodCutoff && ym < periodCutoff) continue;
      if (!matchesBudget(b)) continue;
      if (!byMonth[ym]) byMonth[ym] = { total: 0, paid: 0, budgets: [] };
      byMonth[ym].budgets.push(b);
      byMonth[ym].total += calculateFinalTotal(b);
      if (b.status === "Pago") byMonth[ym].paid += calculateFinalTotal(b);
    }
    const hist = Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a));

    return {
      monthlyBudgets: monthly,
      monthlyTotal: monthTotal,
      monthlyPaid: monthPaid,
      monthlyParts: monthParts,
      monthlyServices: monthServices,
      allTotal: total,
      allPaid: paid,
      allParts,
      allServices,
      history: hist,
      allBudgets: all,
    };
  }, [
    active,
    currentYearMonth,
    historySearch,
    historyPeriod,
    historyMonth,
    historyStatus,
  ]);

  const hasFilters =
    historySearch ||
    historyPeriod !== "todos" ||
    historyMonth !== "todos" ||
    historyStatus !== "todos";
  const visibleHistory =
    historyMonth !== "todos" ? history : history.slice(0, historyCount);

  const clearFilters = () => {
    setHistorySearch("");
    setHistoryPeriod("todos");
    setHistoryMonth("todos");
    setHistoryStatus("todos");
    setHistoryCount(3);
    setAllCount(5);
  };

  return (
    <div className="financial-layout">
      <div className="financial-month-card card">
        <div className="financial-card-title">
          <span>📅</span>
          <div>
            <h2>Mês atual</h2>
            <p>{monthLabel(currentYearMonth)}</p>
          </div>
        </div>
        <div className="financial-stats financial-stats-3">
          <div className="financial-stat">
            <span>🔩 Peças</span>
            <strong>{money(monthlyParts)}</strong>
          </div>
          <div className="financial-stat">
            <span>🔧 Serviços</span>
            <strong>{money(monthlyServices)}</strong>
          </div>
          <div className="financial-stat">
            <span>Total do mês</span>
            <strong className="financial-highlight">
              {money(monthlyTotal)}
            </strong>
          </div>
        </div>
        <div className="financial-card-footer">
          <span>
            {monthlyBudgets.length} orçamento
            {monthlyBudgets.length !== 1 ? "s" : ""}
          </span>
          <span className="financial-paid">{money(monthlyPaid)} recebido</span>
        </div>
        <div className="financial-card-footer">
          <span className="financial-reset-notice">
            Zera automaticamente no início de cada mês
          </span>
        </div>
      </div>

      <div className="financial-total-card card">
        <div className="financial-card-title">
          <span>💰</span>
          <div>
            <h2>Total geral</h2>
            <p>Todos os orçamentos (exceto recusados e cancelados)</p>
          </div>
        </div>
        <div className="financial-stats financial-stats-3">
          <div className="financial-stat">
            <span>🔩 Peças</span>
            <strong>{money(allParts)}</strong>
          </div>
          <div className="financial-stat">
            <span>🔧 Serviços</span>
            <strong>{money(allServices)}</strong>
          </div>
          <div className="financial-stat">
            <span>Total acumulado</span>
            <strong className="financial-highlight">{money(allTotal)}</strong>
          </div>
        </div>
        <div className="financial-card-footer">
          <span>
            {
              saved.filter(
                (b) => b.status !== "Recusado" && b.status !== "Cancelado",
              ).length
            }{" "}
            orçamentos
          </span>
          <span className="financial-paid">{money(allPaid)} recebido</span>
        </div>
      </div>

      <div className="financial-history card">
        <div className="financial-history-header">
          <div className="financial-history-title-row">
            <h2>
              {historyView === "mensal"
                ? "Histórico mensal"
                : "Todos os orçamentos"}
            </h2>
            <div className="financial-view-toggle">
              <button
                className={historyView === "mensal" ? "active" : ""}
                onClick={() => setHistoryView("mensal")}
              >
                Por mês
              </button>
              <button
                className={historyView === "todos" ? "active" : ""}
                onClick={() => setHistoryView("todos")}
              >
                Todos
              </button>
            </div>
          </div>
          <div className="financial-toolbar">
            <div className="search">
              <span>⌕</span>
              <input
                placeholder="Buscar cliente ou número..."
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  setHistoryCount(3);
                }}
              />
            </div>
            <SmoothSelect
              ariaLabel="Filtrar por mês"
              value={historyMonth}
              options={[
                { value: "todos", label: "Todos os meses" },
                ...availableMonths.map((ym) => ({
                  value: ym,
                  label: monthLabel(ym),
                })),
              ]}
              onChange={(v) => {
                setHistoryMonth(v);
                setHistoryCount(3);
              }}
            />
            {historyMonth === "todos" && (
              <SmoothSelect
                ariaLabel="Filtrar por período"
                value={historyPeriod}
                options={[
                  { value: "todos", label: "Todo o período" },
                  { value: "3", label: "Últimos 3 meses" },
                  { value: "6", label: "Últimos 6 meses" },
                  { value: "12", label: "Últimos 12 meses" },
                ]}
                onChange={(v) => {
                  setHistoryPeriod(v);
                  setHistoryCount(3);
                }}
              />
            )}
            <SmoothSelect
              ariaLabel="Filtrar por status"
              value={historyStatus}
              options={[
                { value: "todos", label: "Todos os status" },
                { value: "Enviado", label: "Enviado" },
                { value: "Em andamento", label: "Em andamento" },
                { value: "Aprovado", label: "Aprovado" },
                { value: "Pago", label: "Pago" },
              ]}
              onChange={(v) => {
                setHistoryStatus(v);
                setHistoryCount(3);
              }}
            />
            {hasFilters && (
              <button className="clear-filter" onClick={clearFilters}>
                Limpar filtros
              </button>
            )}
          </div>
        </div>
        {history.length === 0 && historyView === "mensal" && (
          <div className="empty-history">
            <strong>Nenhum orçamento encontrado</strong>
            <span>Tente limpar os filtros ou crie novos orçamentos.</span>
          </div>
        )}
        {historyView === "mensal" &&
          visibleHistory.map(([ym, data]) => (
            <div
              className={`financial-month-group${ym === currentYearMonth ? " current-month" : ""}`}
              key={ym}
            >
              <div className="financial-month-header">
                <div>
                  <strong>{monthLabel(ym)}</strong>
                  {ym === currentYearMonth && <em>atual</em>}
                </div>
                <div className="financial-month-totals">
                  <span>
                    {data.budgets.length} orçamento
                    {data.budgets.length !== 1 ? "s" : ""}
                  </span>
                  <span className="financial-paid">
                    {money(data.paid)} recebido
                  </span>
                  <strong>{money(data.total)}</strong>
                </div>
              </div>
              <div className="financial-budget-list">
                <div className="financial-budget-head">
                  <span>Número</span>
                  <span>Cliente</span>
                  <span>Status</span>
                  <span>Desconto</span>
                  <span>Total</span>
                </div>
                {data.budgets.slice(0, budgetLimit(ym)).map((b) => (
                  <div className="financial-budget-row" key={b.id}>
                    <span className="financial-budget-number">{b.number}</span>
                    <span className="financial-budget-client">
                      {b.client.name || "—"}
                    </span>
                    <span className={`status ${statusClass(b.status)}`}>
                      {b.status}
                    </span>
                    <span className="financial-budget-discount">
                      {calculateDiscountTotal(b) > 0 ? (
                        <span className="financial-discount-badge">
                          − {money(calculateDiscountTotal(b))}
                        </span>
                      ) : (
                        "—"
                      )}
                    </span>
                    <strong className="financial-budget-total">
                      {money(calculateFinalTotal(b))}
                    </strong>
                  </div>
                ))}
                {data.budgets.length > 5 && (
                  <div className="load-controls financial-budget-controls">
                    <span>
                      Exibindo {Math.min(budgetLimit(ym), data.budgets.length)}{" "}
                      de {data.budgets.length}
                    </span>
                    {budgetLimit(ym) > 5 && (
                      <button
                        className="button ghost"
                        onClick={() => resetBudgets(ym)}
                      >
                        ← Voltar ao início
                      </button>
                    )}
                    {budgetLimit(ym) < data.budgets.length && (
                      <button
                        className="button primary"
                        onClick={() => loadMoreBudgets(ym)}
                      >
                        Carregar mais 5
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        {historyView === "mensal" &&
          historyMonth === "todos" &&
          history.length > 3 && (
            <div className="load-controls">
              <span>
                Exibindo {Math.min(historyCount, history.length)} de{" "}
                {history.length} meses
              </span>
              {historyCount > 3 && (
                <button
                  className="button ghost"
                  onClick={() => setHistoryCount(3)}
                >
                  ← Voltar ao início
                </button>
              )}
              {historyCount < history.length && (
                <button
                  className="button primary"
                  onClick={() => setHistoryCount((c) => c + 5)}
                >
                  Carregar mais 5
                </button>
              )}
            </div>
          )}

        {historyView === "todos" && (
          <>
            {allBudgets.length === 0 ? (
              <div className="empty-history">
                <strong>Nenhum orçamento encontrado</strong>
                <span>Tente limpar os filtros ou crie novos orçamentos.</span>
              </div>
            ) : (
              <>
                <div className="financial-budget-list">
                  <div className="financial-budget-head">
                    <span>Número</span>
                    <span>Emissão</span>
                    <span>Cliente</span>
                    <span>Status</span>
                    <span>Desconto</span>
                    <span>Total</span>
                  </div>
                  {allBudgets.slice(0, allCount).map((b) => (
                    <div
                      className="financial-budget-row financial-all-row"
                      key={b.id}
                    >
                      <span className="financial-budget-number">
                        {b.number}
                      </span>
                      <span className="financial-budget-date">
                        {new Date(`${b.issuedAt}T12:00:00`).toLocaleDateString(
                          "pt-BR",
                        )}
                      </span>
                      <span className="financial-budget-client">
                        {b.client.name || "—"}
                      </span>
                      <span className={`status ${statusClass(b.status)}`}>
                        {b.status}
                      </span>
                      <span className="financial-budget-discount">
                        {calculateDiscountTotal(b) > 0 ? (
                          <span className="financial-discount-badge">
                            − {money(calculateDiscountTotal(b))}
                          </span>
                        ) : (
                          "—"
                        )}
                      </span>
                      <strong className="financial-budget-total">
                        {money(calculateFinalTotal(b))}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="financial-all-summary">
                  <span>
                    {allBudgets.length} orçamento
                    {allBudgets.length !== 1 ? "s" : ""}
                  </span>
                  <span className="financial-paid">
                    {money(
                      allBudgets
                        .filter((b) => b.status === "Pago")
                        .reduce((s, b) => s + calculateFinalTotal(b), 0),
                    )}{" "}
                    recebido
                  </span>
                  <strong>
                    {money(
                      allBudgets.reduce(
                        (s, b) => s + calculateFinalTotal(b),
                        0,
                      ),
                    )}{" "}
                    total
                  </strong>
                </div>
                {allBudgets.length > 5 && (
                  <div className="load-controls">
                    <span>
                      Exibindo {Math.min(allCount, allBudgets.length)} de{" "}
                      {allBudgets.length}
                    </span>
                    {allCount > 5 && (
                      <button
                        className="button ghost"
                        onClick={() => setAllCount(5)}
                      >
                        ← Voltar ao início
                      </button>
                    )}
                    {allCount < allBudgets.length && (
                      <button
                        className="button primary"
                        onClick={() => setAllCount((c) => c + 5)}
                      >
                        Carregar mais 5
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
