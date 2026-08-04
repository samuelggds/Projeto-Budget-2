import { useEffect, useMemo, useState } from "react";
import type { MaintenancePlan } from "../types/MaintenancePlan";
import {
  deleteMaintenancePlan,
  loadMaintenancePlans,
  saveMaintenancePlan,
  updateMaintenancePlanStatus,
} from "../services/maintenanceApi";

const EMPTY: MaintenancePlan = {
  id: "",
  companyName: "",
  vehiclePlate: "",
  brand: "",
  model: "",
  firstMaintenanceDate: "",
  nextMaintenanceDate: "",
  notes: "",
};

function daysUntil(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86_400_000,
  );
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
}

export function MaintenancePlans() {
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [draft, setDraft] = useState<MaintenancePlan>({ ...EMPTY });
  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  };

  useEffect(() => {
    void loadMaintenancePlans()
      .then(setPlans)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (!q) return plans;
    return plans.filter((p) =>
      [p.companyName, p.vehiclePlate, p.brand, p.model].some((v) =>
        v.toLocaleLowerCase("pt-BR").includes(q),
      ),
    );
  }, [plans, search]);

  const save = async () => {
    if (!draft.companyName.trim()) return notify("Informe o nome da empresa");
    if (!draft.vehiclePlate.trim()) return notify("Informe a placa");
    if (!draft.brand.trim()) return notify("Informe a marca");
    if (!draft.model.trim()) return notify("Informe o modelo");
    if (!draft.firstMaintenanceDate)
      return notify("Informe a data da primeira manutenção");
    if (!draft.nextMaintenanceDate)
      return notify("Informe a data da próxima manutenção");
    try {
      const saved = await saveMaintenancePlan({
        ...draft,
        id: draft.id || crypto.randomUUID(),
      });
      setPlans((prev) => {
        const without = prev.filter((p) => p.id !== saved.id);
        return [...without, saved].sort((a, b) =>
          a.nextMaintenanceDate.localeCompare(b.nextMaintenanceDate),
        );
      });
      setDraft({ ...EMPTY });
      notify(draft.id ? "Plano atualizado" : "Plano cadastrado");
    } catch (err) {
      notify(`Erro: ${(err as Error).message}`);
    }
  };

  const remove = async (plan: MaintenancePlan) => {
    if (!window.confirm(`Excluir o plano de ${plan.vehiclePlate}?`)) return;
    try {
      await deleteMaintenancePlan(plan.id);
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
      if (draft.id === plan.id) setDraft({ ...EMPTY });
      notify("Plano excluído");
    } catch (err) {
      notify(`Erro: ${(err as Error).message}`);
    }
  };

  const toggleStatus = async (plan: MaintenancePlan) => {
    const next: NonNullable<MaintenancePlan["status"]> =
      !plan.status || plan.status === "pendente"
        ? "concluida"
        : plan.status === "concluida"
          ? "cancelada"
          : "pendente";
    try {
      await updateMaintenancePlanStatus(plan.id, next);
      setPlans((prev) =>
        prev.map((p) => (p.id === plan.id ? { ...p, status: next } : p)),
      );
      notify(
        next === "concluida"
          ? "Manutenção concluída"
          : next === "cancelada"
            ? "Manutenção cancelada"
            : "Status resetado",
      );
    } catch (err) {
      notify(`Erro: ${(err as Error).message}`);
    }
  };

  // Calendar helpers
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthYM = `${String(calYear)}-${String(calMonth + 1).padStart(2, "0")}`;

  const plansByDay = useMemo(() => {
    const map: Record<number, MaintenancePlan[]> = {};
    for (const p of plans) {
      if (p.nextMaintenanceDate.startsWith(monthYM)) {
        const day = Number(p.nextMaintenanceDate.split("-")[2]);
        if (!map[day]) map[day] = [];
        map[day].push(p);
      }
    }
    return map;
  }, [plans, monthYM]);

  const today = new Date();
  const todayDay = today.getDate();
  const todayM = today.getMonth();
  const todayY = today.getFullYear();

  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  return (
    <div className="maintenance-layout">
      {/* Form */}
      <div className={`card maintenance-form ${draft.id ? "is-editing" : ""}`}>
        <div className="section-title">
          <span>🔧</span>
          <div>
            <h2>{draft.id ? "Editar plano" : "Novo plano de manutenção"}</h2>
            <p>Cadastre equipamentos e datas de manutenção</p>
          </div>
        </div>
        {draft.id && (
          <div className="editing-service-notice">
            <strong>✎ Modo de edição ativo</strong>
            <span>Editando plano de {draft.vehiclePlate}.</span>
          </div>
        )}
        <div className="form-grid">
          <label className="wide">
            Nome da empresa / responsável
            <input
              placeholder="Ex.: Transportadora ABC"
              value={draft.companyName}
              onChange={(e) =>
                setDraft({ ...draft, companyName: e.target.value })
              }
            />
          </label>
          <label>
            Placa do veículo
            <input
              placeholder="ABC-1234"
              value={draft.vehiclePlate}
              onChange={(e) =>
                setDraft({ ...draft, vehiclePlate: e.target.value })
              }
              style={{ textTransform: "uppercase" }}
            />
          </label>
          <label>
            Marca do equipamento
            <input
              placeholder="Ex.: Ford, Toyota"
              value={draft.brand}
              onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
            />
          </label>
          <label>
            Modelo
            <input
              placeholder="Ex.: Ranger 2.2, Corolla"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </label>
          <label>
            Data da 1ª manutenção
            <input
              type="date"
              value={draft.firstMaintenanceDate}
              onChange={(e) =>
                setDraft({ ...draft, firstMaintenanceDate: e.target.value })
              }
            />
          </label>
          <label>
            Data da próxima manutenção
            <input
              type="date"
              value={draft.nextMaintenanceDate}
              onChange={(e) =>
                setDraft({ ...draft, nextMaintenanceDate: e.target.value })
              }
            />
          </label>
          <label className="wide">
            Observações
            <input
              placeholder="Ex.: Troca de óleo, revisão geral..."
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
        </div>
        <div className="service-form-actions">
          <button
            className="button primary registry-save"
            onClick={() => void save()}
          >
            {draft.id ? "✓ Atualizar plano" : "＋ Salvar plano"}
          </button>
          {draft.id && (
            <button
              className="button ghost registry-save"
              onClick={() => setDraft({ ...EMPTY })}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </div>

      {/* List + Calendar */}
      <div className="card maintenance-panel">
        <div className="maintenance-panel-header">
          <div className="search">
            <span>⌕</span>
            <input
              placeholder="Buscar empresa, placa, marca ou modelo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="financial-view-toggle">
            <button
              className={view === "lista" ? "active" : ""}
              onClick={() => setView("lista")}
            >
              Lista
            </button>
            <button
              className={view === "calendario" ? "active" : ""}
              onClick={() => setView("calendario")}
            >
              Calendário
            </button>
          </div>
        </div>

        {/* List view */}
        {view === "lista" && (
          <div className="maintenance-table">
            <div className="maintenance-head">
              <span>Empresa</span>
              <span>Placa</span>
              <span>Marca / Modelo</span>
              <span>1ª Manutenção</span>
              <span>Próxima</span>
              <span>Situação</span>
              <span>Ações</span>
            </div>
            {loading && <p className="registry-empty">Carregando...</p>}
            {!loading && filtered.length === 0 && (
              <div className="empty-history">
                <strong>Nenhum plano encontrado</strong>
                <span>
                  {search
                    ? "Altere a busca."
                    : "Cadastre o primeiro plano acima."}
                </span>
              </div>
            )}
            {filtered.map((p) => {
              const days = daysUntil(p.nextMaintenanceDate);
              const urgency = days < 0 ? "overdue" : days <= 7 ? "soon" : "ok";
              return (
                <div className="maintenance-row" key={p.id}>
                  <span className="maintenance-company">{p.companyName}</span>
                  <span className="maintenance-plate">{p.vehiclePlate}</span>
                  <span>
                    {p.brand} {p.model}
                  </span>
                  <span>{fmtDate(p.firstMaintenanceDate)}</span>
                  <span>{fmtDate(p.nextMaintenanceDate)}</span>
                  <span
                    className={`maintenance-status ${
                      p.status === "concluida"
                        ? "maintenance-concluida"
                        : p.status === "cancelada"
                          ? "maintenance-cancelada"
                          : `maintenance-${urgency}`
                    }`}
                  >
                    {p.status === "concluida"
                      ? "Concluída"
                      : p.status === "cancelada"
                        ? "Cancelada"
                        : days < 0
                          ? `${Math.abs(days)}d em atraso`
                          : days === 0
                            ? "Hoje!"
                            : days <= 7
                              ? `Em ${days} dia(s)`
                              : `Em ${days}d`}
                  </span>
                  <div className="supplier-actions">
                    <button
                      onClick={() => {
                        setDraft(p);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="delete-service"
                      onClick={() => void remove(p)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Calendar view */}
        {view === "calendario" && (
          <div className="cal-wrapper">
            <div className="cal-nav">
              <button
                onClick={() => {
                  if (calMonth === 0) {
                    setCalMonth(11);
                    setCalYear((y) => y - 1);
                  } else setCalMonth((m) => m - 1);
                }}
              >
                ‹
              </button>
              <strong>
                {monthNames[calMonth]} {calYear}
              </strong>
              <button
                onClick={() => {
                  if (calMonth === 11) {
                    setCalMonth(0);
                    setCalYear((y) => y + 1);
                  } else setCalMonth((m) => m + 1);
                }}
              >
                ›
              </button>
            </div>
            <div className="cal-grid">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div className="cal-weekday" key={d}>
                  {d}
                </div>
              ))}
              {Array.from({ length: firstDay }, (_, i) => (
                <div className="cal-empty" key={`e-${i}`} />
              ))}
              {calDays.map((day) => {
                const isToday =
                  day === todayDay && calMonth === todayM && calYear === todayY;
                const dayPlans = plansByDay[day] || [];
                const hasOverdue = dayPlans.some(
                  (p) => daysUntil(p.nextMaintenanceDate) < 0,
                );
                const hasSoon = dayPlans.some((p) => {
                  const d = daysUntil(p.nextMaintenanceDate);
                  return d >= 0 && d <= 7;
                });
                return (
                  <div
                    className={[
                      "cal-day",
                      isToday ? "cal-today" : "",
                      dayPlans.length > 0 ? "cal-has-plan" : "",
                      hasOverdue ? "cal-overdue" : hasSoon ? "cal-soon" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={day}
                  >
                    <span className="cal-day-num">{day}</span>
                    {dayPlans.map((p) => {
                      const d = daysUntil(p.nextMaintenanceDate);
                      const chipUrgency =
                        d < 0 ? "overdue" : d <= 7 ? "soon" : "ok";
                      const chipClass =
                        p.status === "concluida"
                          ? "cal-chip-concluida"
                          : p.status === "cancelada"
                            ? "cal-chip-cancelada"
                            : `cal-chip-${chipUrgency}`;
                      return (
                        <div
                          className={`cal-plan-chip ${chipClass}`}
                          key={p.id}
                          title={`${p.companyName} — ${p.brand} ${p.model}${p.notes ? ` | ${p.notes}` : ""}`}
                          onClick={() => void toggleStatus(p)}
                        >
                          <strong>{p.vehiclePlate}</strong>
                          <span className="cal-chip-company">
                            {p.companyName}
                          </span>
                          <span className="cal-chip-model">
                            {p.brand} {p.model}
                          </span>
                          {p.notes && (
                            <span className="cal-chip-notes">{p.notes}</span>
                          )}
                          {p.status === "concluida" && (
                            <span className="cal-chip-status cal-chip-status-ok">
                              ✓ Concluída
                            </span>
                          )}
                          {p.status === "cancelada" && (
                            <span className="cal-chip-status cal-chip-status-cancel">
                              ✗ Cancelada
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="cal-legend">
              <span className="cal-leg-ok">● Manutenção agendada</span>
              <span className="cal-leg-soon">● Vence em até 7 dias</span>
              <span className="cal-leg-overdue">● Em atraso</span>
            </div>
          </div>
        )}
      </div>

      {toast && <div className="toast success">✓ {toast}</div>}
    </div>
  );
}
