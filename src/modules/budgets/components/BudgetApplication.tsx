import { useEffect, useMemo, useRef, useState } from "react";
import type { Budget, BudgetItem as Item } from "../types/Budget";
import { deletePdf, getPdf, savePdf } from "../../pdf/services/pdfStorage";
import {
  createInitialBudget,
  createNextBudget,
} from "../services/budgetFactory";
import {
  calculateBudgetTotal,
  formatMoney as money,
} from "../services/budgetCalculations";
import {
  filterBudgets,
} from "../../history/services/filterBudgets";
import { createBudgetPdf, downloadPdfBlob } from "../../pdf/services/budgetPdf";
import type { Client } from "../../clients/types/Client";
import type { Service } from "../../services/types/Service";
import { getAllowedNextStatuses } from "../services/budgetStatus";
import { supabase } from "../../auth/services/supabase";
import { approveBudgetAndDeductStock, deleteBudgetFromDatabase, deletePartFromDatabase, deleteServiceFromDatabase, loadDatabase, loadPartsFromDatabase, saveAppSettingsToDatabase, saveBudgetToDatabase, saveClientToDatabase, savePartToDatabase, saveServiceToDatabase } from "../../shared/services/supabaseDatabase";
import { SmoothSelect } from "../../shared/components/SmoothSelect";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "../../settings/types/AppSettings";
import type { Part } from "../../stock/types/Part";
import { BillingOverview } from "../../billing/components/BillingOverview";

const withDefaultItemUnit = (current: Budget): Budget => ({
  ...current,
  items: current.items.map((item) => ({ ...item, unit: "un." })),
});

export function BudgetApplication() {
  const [tab, setTab] = useState<"new" | "saved" | "clients" | "services" | "stock" | "billing" | "settings">("new");
  const [preview, setPreview] = useState(false);
  const [budget, setBudget] = useState<Budget>(createInitialBudget);
  const [saved, setSaved] = useState<Budget[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [periodFilter, setPeriodFilter] = useState("Todos");
  const [historyVisibleCount, setHistoryVisibleCount] = useState(10);
  const [toast, setToast] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const [clientDraft, setClientDraft] = useState<Client>({ id: "", name: "", document: "", phone: "", email: "", contact: "", address: "", city: "", state: "CE", cep: "" });
  const [serviceDraft, setServiceDraft] = useState<Service>({ id: "", code: "", description: "", unit: "serv.", unitPrice: 0 });
  const [appSettings, setAppSettings] = useState<AppSettings>({ ...DEFAULT_APP_SETTINGS });
  const [parts, setParts] = useState<Part[]>([]);
  const [partDraft, setPartDraft] = useState<Part>({ id: "", code: "", description: "", stockQuantity: 0, unitPrice: 0 });
  const logoInputRef = useRef<HTMLInputElement>(null);

  const total = useMemo(() => calculateBudgetTotal(budget), [budget]);
  const filtered = filterBudgets(saved, {
    search,
    status: statusFilter,
    period: periodFilter,
  });
  const visibleBudgets = filtered.slice(0, historyVisibleCount);

  useEffect(() => {
    loadDatabase()
      .then((data) => {
        const normalizedBudgets = data.budgets.map(withDefaultItemUnit);
        setClients(data.clients); setServices(data.services); setSaved(normalizedBudgets); setAppSettings(data.settings); setParts(data.parts);
        if (normalizedBudgets.length) setBudget(createNextBudget(normalizedBudgets));
      })
      .catch((error: Error) => setDatabaseError(error.message))
      .finally(() => setDatabaseLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "services" || !serviceDraft.id) return;

    const scrollTimer = window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.getElementById("service-form")?.focus({ preventScroll: true });
    }, 80);

    return () => window.clearTimeout(scrollTimer);
  }, [serviceDraft.id, tab]);

  const notify = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2600);
  };

  const updateClient = (field: keyof Budget["client"], value: string) =>
    setBudget((old) => ({ ...old, client: { ...old.client, [field]: value } }));

  const updateItem = (id: string, field: keyof Item, value: string | number) =>
    setBudget((old) => ({
      ...old,
      items: old.items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));

  const addItem = () =>
    setBudget((old) => ({
      ...old,
      items: [
        ...old.items,
        {
          id: crypto.randomUUID(),
          serviceId: "",
          serviceCode: "",
          description: "",
          quantity: 1,
          unit: "un.",
          unitPrice: 0,
        },
      ],
    }));

  const selectClient = (clientId: string) => {
    const client = clients.find((item) => item.id === clientId);
    if (client) setBudget((old) => ({ ...old, client: { ...client } }));
  };

  const fillServiceByCode = (itemId: string, code: string) => {
    const service = services.find((item) => item.code.toLowerCase() === code.trim().toLowerCase() || item.id === code.trim());
    const part = parts.find((item) => item.code.toLowerCase() === code.trim().toLowerCase() || item.id === code.trim());
    if (part && part.stockQuantity <= 0) return notify(`${part.description} está indisponível no estoque`);
    setBudget((old) => ({
      ...old, items: old.items.map((item) => item.id !== itemId ? item : service ? {
        ...item,
        serviceId: service.id, partId: "",
        serviceCode: service.code,
        description: service.description,
        unit: "un.",
        unitPrice: service.unitPrice,
      } : part ? {
        ...item, serviceId: "", partId: part.id, serviceCode: part.code,
        description: part.description, unit: "un.", unitPrice: part.unitPrice,
      } : { ...item, serviceId: "", partId: "", serviceCode: code }),
    }));
  };

  const registerClient = async () => {
    if (!clientDraft.name.trim()) return notify("Informe o nome do cliente");
    try {
      const current = await saveClientToDatabase({ ...clientDraft, id: clientDraft.id || crypto.randomUUID() });
      setClients([current, ...clients.filter((item) => item.id !== current.id)]);
      setClientDraft({ id: "", name: "", document: "", phone: "", email: "", contact: "", address: "", city: "", state: "CE", cep: "" });
      notify("Cliente salvo no banco");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const registerService = async () => {
    if (!serviceDraft.code.trim() || !serviceDraft.description.trim()) return notify("Informe o código e o serviço");
    if (services.some((item) => item.code.toLowerCase() === serviceDraft.code.toLowerCase() && item.id !== serviceDraft.id)) return notify("Este código já está cadastrado");
    if (parts.some((item) => item.code.toLowerCase() === serviceDraft.code.toLowerCase())) return notify("Este código já pertence a uma peça do estoque");
    const isEditing = Boolean(serviceDraft.id);
    try {
      const current = await saveServiceToDatabase({ ...serviceDraft, id: serviceDraft.id || crypto.randomUUID() });
      setServices([current, ...services.filter((item) => item.id !== current.id)]);
      setServiceDraft({ id: "", code: "", description: "", unit: "serv.", unitPrice: 0 });
      notify(isEditing ? "Serviço atualizado no banco" : "Serviço salvo no banco");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const editService = (service: Service) => {
    setServiceDraft(service);
    notify(`Editando o serviço ${service.code}`);
  };

  const clearServiceDraft = () => {
    setServiceDraft({ id: "", code: "", description: "", unit: "serv.", unitPrice: 0 });
  };

  const clearPartDraft = () => setPartDraft({ id: "", code: "", description: "", stockQuantity: 0, unitPrice: 0 });

  const registerPart = async () => {
    if (!partDraft.code.trim() || !partDraft.description.trim()) return notify("Informe o código e a peça");
    if (partDraft.stockQuantity < 0 || partDraft.unitPrice < 0) return notify("Quantidade e valor não podem ser negativos");
    if (parts.some((item) => item.code.toLowerCase() === partDraft.code.toLowerCase() && item.id !== partDraft.id)) return notify("Este código já está cadastrado");
    if (services.some((item) => item.code.toLowerCase() === partDraft.code.toLowerCase())) return notify("Este código já pertence a um serviço");
    try {
      const current = await savePartToDatabase({ ...partDraft, id: partDraft.id || crypto.randomUUID() });
      setParts([current, ...parts.filter((item) => item.id !== current.id)]);
      clearPartDraft();
      notify(partDraft.id ? "Peça atualizada no estoque" : "Peça adicionada ao estoque");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const removePart = async (part: Part) => {
    if (!window.confirm(`Excluir a peça ${part.code} — ${part.description}?`)) return;
    try {
      await deletePartFromDatabase(part.id);
      setParts(parts.filter((item) => item.id !== part.id));
      if (partDraft.id === part.id) clearPartDraft();
      notify("Peça excluída do estoque");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const addPartToBudget = (part: Part) => {
    if (part.stockQuantity <= 0) return notify("Esta peça está indisponível");
    setBudget((current) => {
      const base = ["Aprovado", "Pago", "Recusado"].includes(current.status) ? createNextBudget(saved) : current;
      const emptyOnly = base.items.length === 1 && !base.items[0].description.trim() && !base.items[0].serviceCode;
      const partItem: Item = { id: crypto.randomUUID(), serviceId: "", partId: part.id, serviceCode: part.code, description: part.description, quantity: 1, unit: "un.", unitPrice: part.unitPrice };
      return { ...base, items: emptyOnly ? [partItem] : [...base.items, partItem] };
    });
    setPreview(false); setTab("new");
    notify(`${part.description} adicionada ao orçamento`);
  };

  const addServiceToBudget = (service: Service) => {
    setBudget((current) => {
      const base = ["Aprovado", "Pago", "Recusado"].includes(current.status) ? createNextBudget(saved) : current;
      const emptyOnly = base.items.length === 1 && !base.items[0].description.trim() && !base.items[0].serviceCode;
      const serviceItem: Item = {
        id: crypto.randomUUID(), serviceId: service.id, partId: "",
        serviceCode: service.code, description: service.description,
        quantity: 1, unit: "un.", unitPrice: service.unitPrice,
      };
      return { ...base, items: emptyOnly ? [serviceItem] : [...base.items, serviceItem] };
    });
    setPreview(false); setTab("new");
    notify(`${service.description} adicionada ao orçamento`);
  };

  const updateAppSetting = (field: keyof AppSettings, value: string) =>
    setAppSettings((current) => ({ ...current, [field]: value }));

  const chooseLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify("Selecione uma imagem válida");
    if (file.size > 2 * 1024 * 1024) return notify("A logo deve ter no máximo 2 MB");
    const reader = new FileReader();
    reader.onload = () => updateAppSetting("logoDataUrl", String(reader.result || ""));
    reader.onerror = () => notify("Não foi possível carregar a logo");
    reader.readAsDataURL(file);
  };

  const saveAppSettings = async () => {
    if (!appSettings.companyName.trim() || !appSettings.appName.trim() || !appSettings.segment.trim()) return notify("Preencha os nomes da marca");
    try {
      const savedSettings = await saveAppSettingsToDatabase(appSettings);
      setAppSettings(savedSettings);
      notify("Configurações da marca salvas");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const brandLogo = appSettings.logoDataUrl || "/logo-placeholder.svg";
  const brandInitials = appSettings.companyName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "LOGO";

  const advanceStatus = async (nextStatus: Budget["status"]) => {
    if (!getAllowedNextStatuses(budget.status).includes(nextStatus)) return notify("Mudança de status não permitida");
    try {
      const updated = nextStatus === "Aprovado"
        ? await approveBudgetAndDeductStock(withDefaultItemUnit(budget))
        : await saveBudgetToDatabase({ ...budget, status: nextStatus });
      setBudget(updated); setSaved([updated, ...saved.filter((item) => item.id !== updated.id)]);
      if (nextStatus === "Aprovado") setParts(await loadPartsFromDatabase());
      notify(`Status alterado para ${nextStatus}`);
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const removeService = async (service: Service) => {
    if (!window.confirm(`Excluir o serviço ${service.code} — ${service.description}?`)) return;
    try {
      await deleteServiceFromDatabase(service.id);
      setServices(services.filter((item) => item.id !== service.id));
      if (serviceDraft.id === service.id) setServiceDraft({ id: "", code: "", description: "", unit: "serv.", unitPrice: 0 });
      notify("Serviço excluído do banco");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };


  const downloadServicesPdf = async () => {
    const element = document.getElementById("service-pdf");
    if (!element) return;
    notify("Gerando planilha em PDF...");
    element.classList.add("is-exporting");
    try {
      const pdf = await createBudgetPdf(element, `planilha-servicos-${new Date().toISOString().slice(0, 10)}.pdf`);
      await pdf.download();
      notify("Planilha baixada em PDF");
    } finally { element.classList.remove("is-exporting"); }
  };

  const saveBudget = async () => {
    try {
      const current = await saveBudgetToDatabase(withDefaultItemUnit(budget));
      setBudget(current); setSaved([current, ...saved.filter((item) => item.id !== current.id)]);
      notify("Orçamento salvo no banco");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const newBudget = () => {
    setBudget(createNextBudget(saved));
    setPreview(false);
    setTab("new");
  };

  const openBudget = (item: Budget) => {
    setBudget(withDefaultItemUnit(item));
    setTab("new");
    setPreview(false);
  };

  const removeBudget = async (item: Budget) => {
    if (
      !window.confirm(
        `Excluir o orçamento ${item.number} de ${item.client.name || "cliente não informado"}?`,
      )
    )
      return;
    try {
      await deleteBudgetFromDatabase(item.id);
      const next = saved.filter((savedItem) => savedItem.id !== item.id);
      setSaved(next); await deletePdf(item.id);
      notify("Orçamento e PDF excluídos");
    } catch (error) { notify(`Erro: ${(error as Error).message}`); }
  };

  const generateAndStorePdf = async () => {
    const element = document.getElementById("budget-pdf");
    if (!element) return;
    notify("Gerando PDF...");
    const pdf = await createBudgetPdf(element, `${budget.number}.pdf`);
    const blob = pdf.blob;
    await savePdf(budget.id, blob);
    const updated = {
      ...withDefaultItemUnit(budget),
      pdfSavedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const next = [updated, ...saved.filter((item) => item.id !== updated.id)];
    setBudget(updated);
    setSaved(next);
    await saveBudgetToDatabase(updated);
    await pdf.download();
    notify("Orçamento e PDF salvos");
  };

  const downloadStoredPdf = async (item: Budget) => {
    const blob = await getPdf(item.id);
    if (!blob) {
      notify("PDF não encontrado. Abra o orçamento e gere novamente.");
      return;
    }
    downloadPdfBlob(blob, `${item.number}.pdf`);
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("Todos");
    setPeriodFilter("Todos");
    setHistoryVisibleCount(10);
  };

  if (databaseLoading) return <div className="auth-loading"><img src="/logo-placeholder.svg" alt="Logo" /><span>Carregando dados do banco...</span></div>;

  if (databaseError) return (
    <main className="database-error-page"><section className="login-card"><div className="login-brand"><img src="/logo-placeholder.svg" alt="Logo" /><div><strong>Erro ao acessar o banco</strong><span>Confira a configuração do Supabase</span></div></div><div className="login-error">{databaseError}</div><p>Confirme se as tabelas foram criadas, se o RLS possui as políticas indicadas e se as variáveis do arquivo .env estão corretas.</p><button className="button primary" onClick={() => window.location.reload()}>Tentar novamente</button></section></main>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={brandLogo} alt={`Logo de ${appSettings.companyName}`} />
          <div>
            <strong>{appSettings.appName}</strong>
            <span>{appSettings.segment}</span>
          </div>
        </div>
        <nav>
          <button
            className={tab === "new" ? "active" : ""}
            onClick={newBudget}
          >
            <i>＋</i>Novo orçamento
          </button>
          <button
            className={tab === "saved" ? "active" : ""}
            onClick={() => setTab("saved")}
          >
            <i>▤</i>Orçamentos
          </button>
          <button className={tab === "clients" ? "active" : ""} onClick={() => setTab("clients")}>
            <i>♙</i>Clientes
          </button>
          <button className={tab === "services" ? "active" : ""} onClick={() => setTab("services")}>
            <i>▦</i>Serviços
          </button>
          <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>
            <i>▣</i>Estoque
          </button>
          <button className={tab === "billing" ? "active" : ""} onClick={() => setTab("billing")}>
            <i>R$</i>Mensalidade
          </button>
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            <i>⚙</i>Configurações
          </button>
        </nav>
        <div className="sidebar-card">
          <span>Atalho rápido</span>
          <strong>Crie, salve e envie seus orçamentos em minutos.</strong>
          <button onClick={newBudget}>Criar agora →</button>
        </div>
        <div className="profile">
          <span>{brandInitials}</span>
          <div>
            <strong>{appSettings.companyName}</strong>
            <small>Administrador</small>
          </div>
          <button className="logout-button" title="Sair" onClick={() => void supabase.auth.signOut({ scope: "local" })}>↪</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">PAINEL DE ORÇAMENTOS</p>
            <h1>
              {tab === "new"
                ? preview
                  ? "Pré-visualização"
                  : "Novo orçamento"
                : tab === "saved" ? "Orçamentos"
                : tab === "clients" ? "Clientes"
                : tab === "services" ? "Catálogo de serviços"
                : tab === "stock" ? "Estoque de peças"
                : tab === "billing" ? "Mensalidade"
                : "Configurações"}
            </h1>
            <p>
              {tab === "new"
                ? "Preencha os dados e gere uma proposta profissional."
                : tab === "saved" ? "Consulte e gerencie suas propostas comerciais."
                : tab === "clients" ? "Cadastre os clientes que serão usados nos orçamentos."
                : tab === "services" ? "Cadastre códigos, descrições e valores para preenchimento automático."
                : tab === "stock" ? "Cadastre peças para venda e adicione-as aos orçamentos."
                : tab === "billing" ? "Acompanhe vencimentos, pagamentos e faturas da assinatura."
                : "Personalize os dados exibidos nos orçamentos."}
            </p>
          </div>
          {tab === "saved" && (
            <button className="button primary" onClick={newBudget}>
              ＋ Novo orçamento
            </button>
          )}
        </header>

        {tab === "new" && !preview && (
          <div className="editor">
            <section className="card overview">
              <div className="section-title">
                <span>01</span>
                <div>
                  <h2>Identificação</h2>
                  <p>Dados básicos da proposta</p>
                </div>
              </div>
              <div className="form-grid three">
                <label>
                  Número do orçamento
                  <input
                    value={budget.number}
                    readOnly
                    aria-readonly="true"
                    title="Número gerado automaticamente"
                  />
                </label>
                <label>
                  Data de emissão
                  <input
                    type="date"
                    value={budget.issuedAt}
                    onChange={(e) =>
                      setBudget({ ...budget, issuedAt: e.target.value })
                    }
                  />
                </label>
                <label>
                  Validade
                  <SmoothSelect ariaLabel="Validade" value={String(budget.validDays)} onChange={(value) => setBudget({ ...budget, validDays: Number(value) })} options={[
                    { value: "5", label: "5 dias" }, { value: "10", label: "10 dias" }, { value: "15", label: "15 dias" }, { value: "30", label: "30 dias" },
                  ]} />
                </label>
              </div>
            </section>

            <section className="card">
              <div className="section-title">
                <span>02</span>
                <div>
                  <h2>Dados do cliente</h2>
                  <p>Quem receberá este orçamento?</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="full">
                  Selecionar cliente cadastrado
                  <SmoothSelect ariaLabel="Selecionar cliente" value={budget.client.id || ""} onChange={selectClient} options={[
                    { value: "", label: "Preencher manualmente" },
                    ...clients.map((client) => ({ value: client.id, label: `${client.name} · ${client.document || "sem documento"}` })),
                  ]} />
                </label>
                <label className="wide">
                  Nome / Razão social
                  <input
                    placeholder="Ex.: Empresa ou nome do cliente"
                    value={budget.client.name}
                    onChange={(e) => updateClient("name", e.target.value)}
                  />
                </label>
                <label>
                  CPF / CNPJ
                  <input
                    placeholder="000.000.000-00"
                    value={budget.client.document}
                    onChange={(e) => updateClient("document", e.target.value)}
                  />
                </label>
                <label>
                  Telefone
                  <input
                    placeholder="(85) 99999-9999"
                    value={budget.client.phone}
                    onChange={(e) => updateClient("phone", e.target.value)}
                  />
                </label>
                <label>
                  E-mail
                  <input
                    type="email"
                    placeholder="cliente@email.com"
                    value={budget.client.email}
                    onChange={(e) => updateClient("email", e.target.value)}
                  />
                </label>
                <label>
                  Contato
                  <input
                    placeholder="Pessoa de contato"
                    value={budget.client.contact}
                    onChange={(e) => updateClient("contact", e.target.value)}
                  />
                </label>
                <label className="wide">
                  Endereço
                  <input
                    placeholder="Rua, número e complemento"
                    value={budget.client.address}
                    onChange={(e) => updateClient("address", e.target.value)}
                  />
                </label>
                <label>
                  Cidade
                  <input
                    value={budget.client.city}
                    onChange={(e) => updateClient("city", e.target.value)}
                  />
                </label>
                <label className="short">
                  UF
                  <input
                    maxLength={2}
                    value={budget.client.state}
                    onChange={(e) =>
                      updateClient("state", e.target.value.toUpperCase())
                    }
                  />
                </label>
                <label>
                  CEP
                  <input
                    placeholder="00000-000"
                    value={budget.client.cep}
                    onChange={(e) => updateClient("cep", e.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="card items-card">
              <div className="section-heading">
                <div className="section-title">
                  <span>03</span>
                  <div>
                    <h2>Serviços e peças</h2>
                    <p>Adicione a mão de obra e as peças no mesmo orçamento</p>
                  </div>
                </div>
                <button className="button soft" onClick={addItem}>
                  ＋ Adicionar item
                </button>
              </div>
              <div className="items-table">
                <div className="item-head">
                  <span>Código</span>
                  <span>Descrição</span>
                  <span>Qtd.</span>
                  <span>Unidade</span>
                  <span>Valor unitário</span>
                  <span>Total</span>
                  <span></span>
                </div>
                {budget.items.map((item, index) => (
                  <div className="item-row" key={item.id}>
                    <input
                      list="item-codes"
                      placeholder="Código"
                      value={item.serviceCode || ""}
                      onChange={(e) => fillServiceByCode(item.id, e.target.value)}
                    />
                    <div className="description-field">
                      <b>{String(index + 1).padStart(2, "0")}</b>
                      <input
                        placeholder="Descreva o serviço ou a peça"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(item.id, "description", e.target.value)
                        }
                      />
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(item.id, "quantity", Number(e.target.value))
                      }
                    />
                    <input value="un." readOnly aria-label="Unidade do item" title="A unidade padrão dos itens é un." />
                    <div className="money-input">
                      <span>R$</span>
                      <input
                        type="number"
                        min="0"
                        step=".01"
                        value={item.unitPrice || ""}
                        placeholder="0,00"
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "unitPrice",
                            Number(e.target.value),
                          )
                        }
                      />
                    </div>
                    <strong>{money(item.quantity * item.unitPrice)}</strong>
                    <button
                      className="remove"
                      disabled={budget.items.length === 1}
                      onClick={() =>
                        setBudget((old) => ({
                          ...old,
                          items: old.items.filter((i) => i.id !== item.id),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <datalist id="item-codes">
                  {services.map((service) => <option key={`service-${service.id}`} value={service.code}>Mão de obra · {service.description}</option>)}
                  {parts.filter((part) => part.stockQuantity > 0).map((part) => <option key={`part-${part.id}`} value={part.code}>Peça · {part.description} · estoque {part.stockQuantity}</option>)}
                </datalist>
              </div>
              <div className="total-box">
                <span>Total do orçamento</span>
                <strong>{money(total)}</strong>
              </div>
            </section>

            <section className="card">
              <div className="section-title">
                <span>04</span>
                <div>
                  <h2>Condições comerciais</h2>
                  <p>Finalize os detalhes da proposta</p>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Condição de pagamento
                  <SmoothSelect className="payment-method-select" ariaLabel="Condição de pagamento" value={["Depósito", "PIX", "Boleto", "Transferência"].includes(budget.payment) ? budget.payment : ""} onChange={(value) => setBudget({ ...budget, payment: value })} options={[
                    { value: "", label: "Selecione a forma de pagamento", disabled: true }, { value: "Depósito", label: "Depósito" }, { value: "PIX", label: "PIX" }, { value: "Boleto", label: "Boleto" }, { value: "Transferência", label: "Transferência" },
                  ]} />
                </label>
                <label>
                  Status
                  <input value={budget.status} readOnly />
                </label>
                <div className="status-actions full">
                  <span>Próxima etapa</span>
                  {getAllowedNextStatuses(budget.status).filter((status) => status !== "Recusado").map((status) => (
                    <button key={status} className="button primary" onClick={() => advanceStatus(status)}>Avançar para {status}</button>
                  ))}
                  {getAllowedNextStatuses(budget.status).includes("Recusado") && (
                    <button className="button danger" onClick={() => advanceStatus("Recusado")}>Marcar como recusado</button>
                  )}
                  {getAllowedNextStatuses(budget.status).length === 0 && <strong>Status final: {budget.status}</strong>}
                </div>
                <label className="full">
                  Observações
                  <textarea
                    rows={4}
                    value={budget.notes}
                    onChange={(e) =>
                      setBudget({ ...budget, notes: e.target.value })
                    }
                  />
                </label>
              </div>
            </section>
          </div>
        )}

        {tab === "new" && preview && (
          <div className="preview-area">
            <article
              id="budget-pdf"
              className={`paper ${budget.items.length > 12 ? "paper-ultra" : budget.items.length > 7 ? "paper-dense" : ""}`}
            >
              <div className="paper-head">
                <img src={brandLogo} alt={`Logo de ${appSettings.companyName}`} />
                <div>
                  <h2>{appSettings.companyName.toUpperCase()}</h2>
                  <p>{appSettings.address || "Endereço não informado"}</p>
                  <p>{appSettings.phone || "Telefone não informado"}</p>
                  <p>{appSettings.document ? `CNPJ/CPF ${appSettings.document}` : "Documento não informado"} · {appSettings.email || "E-mail não informado"}</p>
                </div>
                <div className="paper-number">
                  <span>ORÇAMENTO DE SERVIÇOS E PEÇAS</span>
                  <strong>{budget.number}</strong>
                  <small>
                    Emissão:{" "}
                    {new Date(`${budget.issuedAt}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}
                  </small>
                </div>
              </div>
              <div className="paper-client">
                <span>CLIENTE</span>
                <h3>{budget.client.name || "Nome do cliente"}</h3>
                <div>
                  <p>
                    <b>CPF/CNPJ:</b> {budget.client.document || "—"}
                  </p>
                  <p>
                    <b>Telefone:</b> {budget.client.phone || "—"}
                  </p>
                  <p>
                    <b>E-mail:</b> {budget.client.email || "—"}
                  </p>
                  <p>
                    <b>Contato:</b> {budget.client.contact || "—"}
                  </p>
                </div>
                <p>
                  <b>Endereço:</b>{" "}
                  {[
                    budget.client.address,
                    budget.client.city,
                    budget.client.state,
                    budget.client.cep,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
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
                  {budget.items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{String(index + 1).padStart(2, "0")}</td>
                      <td><span className={`paper-item-type ${item.partId ? "part" : item.serviceId ? "service" : "manual"}`}>{item.partId ? "Peça" : item.serviceId ? "Mão de obra" : "Item manual"}</span></td>
                      <td>{item.description || "Item ou serviço"}</td>
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
                    <b>Pagamento:</b> {budget.payment}
                  </p>
                  <p>
                    <b>Validade do orçamento:</b> {budget.validDays} dias após a
                    emissão
                  </p>
                </div>
                <div>
                  <span>VALOR TOTAL</span>
                  <strong>{money(total)}</strong>
                </div>
              </div>
              <div className="paper-notes">
                <span>OBSERVAÇÕES</span>
                <p>{budget.notes || "Sem observações adicionais."}</p>
              </div>
              <div className="signatures">
                <div></div>
                <div></div>
                <p>{appSettings.companyName}</p>
                <p>{budget.client.name || "Cliente"}</p>
              </div>
              <footer>
                Obrigado pela preferência. Estamos à disposição para esclarecer
                qualquer dúvida.
              </footer>
            </article>
          </div>
        )}

        {tab === "new" && (
          <div className="budget-bottom-actions card">
            <div>
              <strong>{preview ? "Pré-visualização do orçamento" : "Orçamento pronto?"}</strong>
              <span>{preview ? "Confira o documento antes de salvar ou baixar o PDF." : "Visualize o documento ou salve os dados no Supabase."}</span>
            </div>
            <button className="button ghost" onClick={() => setPreview(!preview)}>
              {preview ? "← Voltar para edição" : "◉ Visualizar"}
            </button>
            <button className="button primary" onClick={saveBudget}>
              ✓ Salvar orçamento
            </button>
            {preview && (
              <button className="button primary" onClick={generateAndStorePdf}>
                ↧ Salvar e baixar PDF
              </button>
            )}
          </div>
        )}

        {tab === "saved" && (
          <section className="card saved-card">
            <div className="history-summary">
              <div>
                <strong>{saved.length}</strong>
                <span>orçamentos salvos</span>
              </div>
              <div>
                <strong>
                  {saved.filter((item) => item.pdfSavedAt).length}
                </strong>
                <span>PDFs guardados</span>
              </div>
              <p>
                Use os filtros para encontrar rapidamente sem acumular
                informações na tela.
              </p>
            </div>
            <div className="saved-toolbar">
              <div className="search">
                <span>⌕</span>
                <input
                  placeholder="Buscar cliente ou número..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setHistoryVisibleCount(10);
                  }}
                />
              </div>
              <SmoothSelect
                ariaLabel="Filtrar por status"
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value);
                  setHistoryVisibleCount(10);
                }}
                options={["Todos", "Enviado", "Recusado", "Em andamento", "Aprovado", "Pago"].map((value) => ({ value, label: value }))}
              />
              <SmoothSelect
                ariaLabel="Filtrar por período"
                value={periodFilter}
                onChange={(value) => {
                  setPeriodFilter(value);
                  setHistoryVisibleCount(10);
                }}
                options={[{ value: "Todos", label: "Todo o período" }, { value: "7", label: "Últimos 7 dias" }, { value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }]}
              />
              <button className="clear-filter" onClick={clearFilters}>
                Limpar filtros
              </button>
              <span>{filtered.length} encontrados</span>
            </div>
            <div className="saved-table">
              <div className="saved-head">
                <span>Orçamento</span>
                <span>Cliente</span>
                <span>Emissão</span>
                <span>Valor</span>
                <span>Status</span>
                <span>PDF</span>
                <span>Ações</span>
              </div>
              {visibleBudgets.map((item) => (
                <div className="saved-row" key={item.id}>
                  <strong>{item.number}</strong>
                  <div>
                    <b>{item.client.name || "Cliente não informado"}</b>
                    <small>{item.client.phone || "Sem telefone"}</small>
                  </div>
                  <span>
                    {new Date(`${item.issuedAt}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}
                  </span>
                  <b>
                    {money(
                      item.items.reduce(
                        (sum, budgetItem) =>
                          sum + budgetItem.quantity * budgetItem.unitPrice,
                        0,
                      ),
                    )}
                  </b>
                  <em className={`status ${item.status.toLowerCase()}`}>
                    {item.status}
                  </em>
                  <button
                    className={item.pdfSavedAt ? "pdf-ready" : "pdf-missing"}
                    disabled={!item.pdfSavedAt}
                    onClick={() => downloadStoredPdf(item)}
                  >
                    {item.pdfSavedAt ? "Baixar PDF" : "Não gerado"}
                  </button>
                  <div className="row-actions">
                    <button onClick={() => openBudget(item)}>Abrir</button>
                    <button
                      className="delete-action"
                      onClick={() => removeBudget(item)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
              {visibleBudgets.length === 0 && (
                <div className="empty-history">
                  <strong>Nenhum orçamento encontrado</strong>
                  <span>
                    Tente limpar os filtros ou crie um novo orçamento.
                  </span>
                </div>
              )}
            </div>
            {filtered.length > 10 && (
              <div className="load-controls">
                <span>Exibindo {Math.min(historyVisibleCount, filtered.length)} de {filtered.length}</span>
                {historyVisibleCount > 10 && <button className="button ghost" onClick={() => setHistoryVisibleCount(10)}>← Voltar para 10</button>}
                {historyVisibleCount < filtered.length && <button className="button primary" onClick={() => setHistoryVisibleCount((count) => count + 5)}>Carregar mais 5</button>}
              </div>
            )}
          </section>
        )}

        {tab === "clients" && (
          <section className="registry-layout">
            <div className="card registry-form">
              <div className="section-title"><span>01</span><div><h2>Cadastro de cliente</h2><p>Dados armazenados para reutilização</p></div></div>
              <div className="form-grid">
                <label className="wide">Nome / Razão social<input value={clientDraft.name} onChange={(e) => setClientDraft({ ...clientDraft, name: e.target.value })} /></label>
                <label>CPF / CNPJ<input value={clientDraft.document} onChange={(e) => setClientDraft({ ...clientDraft, document: e.target.value })} /></label>
                <label>Telefone<input value={clientDraft.phone} onChange={(e) => setClientDraft({ ...clientDraft, phone: e.target.value })} /></label>
                <label>E-mail<input value={clientDraft.email} onChange={(e) => setClientDraft({ ...clientDraft, email: e.target.value })} /></label>
                <label>Contato<input value={clientDraft.contact} onChange={(e) => setClientDraft({ ...clientDraft, contact: e.target.value })} /></label>
                <label className="wide">Endereço<input value={clientDraft.address} onChange={(e) => setClientDraft({ ...clientDraft, address: e.target.value })} /></label>
                <label>Cidade<input value={clientDraft.city} onChange={(e) => setClientDraft({ ...clientDraft, city: e.target.value })} /></label>
                <label>UF<input maxLength={2} value={clientDraft.state} onChange={(e) => setClientDraft({ ...clientDraft, state: e.target.value.toUpperCase() })} /></label>
                <label>CEP<input value={clientDraft.cep} onChange={(e) => setClientDraft({ ...clientDraft, cep: e.target.value })} /></label>
              </div>
              <button className="button primary registry-save" onClick={registerClient}>Salvar cliente</button>
            </div>
            <div className="card registry-list">
              <h2>Clientes cadastrados</h2>
              {clients.map((client) => <div className="registry-row" key={client.id}><div><strong>{client.name}</strong><small>{client.document || "Sem documento"} · {client.phone || "Sem telefone"}</small></div><button onClick={() => setClientDraft(client)}>Editar</button></div>)}
              {!clients.length && <p className="registry-empty">Nenhum cliente cadastrado.</p>}
            </div>
          </section>
        )}

        {tab === "services" && (
          <section className="registry-layout">
            <div id="service-form" tabIndex={-1} className={`card registry-form service-form-card ${serviceDraft.id ? "is-editing" : ""}`}>
              <div className="section-title"><span>02</span><div><h2>{serviceDraft.id ? "Editar serviço" : "Cadastro de serviço"}</h2><p>{serviceDraft.id ? `Altere os dados de ${serviceDraft.code} e clique em Atualizar serviço` : "Esta tabela será ligada aos IDs do backend"}</p></div></div>
              {serviceDraft.id && <div className="editing-service-notice"><strong>✎ Modo de edição ativo</strong><span>Você está editando o serviço {serviceDraft.code}.</span></div>}
              <div className="form-grid">
                <label>Código<input placeholder="Ex.: SRV-001" value={serviceDraft.code} onChange={(e) => setServiceDraft({ ...serviceDraft, code: e.target.value.toUpperCase() })} /></label>
                <label className="wide">Serviço<input value={serviceDraft.description} onChange={(e) => setServiceDraft({ ...serviceDraft, description: e.target.value })} /></label>
                <label>Unidade<SmoothSelect ariaLabel="Unidade do serviço" value={serviceDraft.unit} onChange={(value) => setServiceDraft({ ...serviceDraft, unit: value })} options={[{ value: "serv.", label: "serv." }, { value: "un.", label: "un." }, { value: "h", label: "h" }, { value: "m", label: "m" }, { value: "kg", label: "kg" }]} /></label>
                <label>Valor<input type="number" min="0" step=".01" value={serviceDraft.unitPrice || ""} onChange={(e) => setServiceDraft({ ...serviceDraft, unitPrice: Number(e.target.value) })} /></label>
              </div>
              <div className="service-form-actions">
                <button className="button primary registry-save" onClick={registerService}>{serviceDraft.id ? "✓ Atualizar serviço" : "Salvar serviço"}</button>
                {serviceDraft.id && <button className="button ghost registry-save" onClick={clearServiceDraft}>Cancelar edição</button>}
              </div>
            </div>
            <div className="card registry-list">
              <div className="registry-title"><h2>Planilha de serviços</h2><div className="registry-actions"><button className="button ghost" disabled={!services.length} onClick={downloadServicesPdf}>↧ Gerar PDF</button><button className="button soft" onClick={() => { clearServiceDraft(); document.getElementById("service-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>＋ Adicionar serviço</button></div></div>
              <div id="service-pdf" className="services-paper">
                <div className="services-paper-head"><img src={brandLogo} alt={`Logo de ${appSettings.companyName}`} /><div><h2>PLANILHA DE SERVIÇOS</h2><p>{appSettings.companyName} · Emitida em {new Date().toLocaleDateString("pt-BR")}</p></div></div>
                <div className="service-head pdf-service-head"><span>Código</span><span>Serviço</span><span>Unidade</span><span>Valor</span><span className="service-actions-label">Ações</span></div>
                {services.map((service) => <div className={`service-row pdf-service-row ${serviceDraft.id === service.id ? "is-being-edited" : ""}`} key={service.id}><code>{service.code}</code><div><strong>{service.description}</strong></div><span>{service.unit}</span><b>{money(service.unitPrice)}</b><div className="service-actions"><button className="add-to-budget" onClick={() => addServiceToBudget(service)}>＋ Orçamento</button><button onClick={() => editService(service)}>{serviceDraft.id === service.id ? "Editando..." : "Editar"}</button><button className="delete-service" onClick={() => removeService(service)}>Excluir</button></div></div>)}
                <footer>{services.length} serviço(s) cadastrado(s)</footer>
              </div>
              {!services.length && <p className="registry-empty">Cadastre um serviço para usar o preenchimento automático.</p>}
            </div>
          </section>
        )}

        {tab === "stock" && (
          <section className="registry-layout stock-layout">
            <div className={`card registry-form ${partDraft.id ? "is-editing" : ""}`}>
              <div className="section-title"><span>▣</span><div><h2>{partDraft.id ? "Editar peça" : "Adicionar peça ao estoque"}</h2><p>Cadastre peças disponíveis para venda nos orçamentos</p></div></div>
              {partDraft.id && <div className="editing-service-notice"><strong>✎ Modo de edição ativo</strong><span>Atualize os dados de {partDraft.code}.</span></div>}
              <div className="form-grid">
                <label>Código<input placeholder="Ex.: PEC-001" value={partDraft.code} onChange={(event) => setPartDraft({ ...partDraft, code: event.target.value.toUpperCase() })} /></label>
                <label className="wide">Peça<input placeholder="Nome ou descrição da peça" value={partDraft.description} onChange={(event) => setPartDraft({ ...partDraft, description: event.target.value })} /></label>
                <label>Quantidade em estoque<input type="number" min="0" step="1" value={partDraft.stockQuantity || ""} onChange={(event) => setPartDraft({ ...partDraft, stockQuantity: Number(event.target.value) })} /></label>
                <label>Valor de venda<input type="number" min="0" step=".01" value={partDraft.unitPrice || ""} onChange={(event) => setPartDraft({ ...partDraft, unitPrice: Number(event.target.value) })} /></label>
              </div>
              <div className="service-form-actions">
                <button className="button primary registry-save" onClick={registerPart}>{partDraft.id ? "✓ Atualizar peça" : "＋ Salvar peça"}</button>
                {partDraft.id && <button className="button ghost registry-save" onClick={clearPartDraft}>Cancelar edição</button>}
              </div>
            </div>
            <div className="card registry-list">
              <div className="registry-title"><div><h2>Peças cadastradas</h2><p className="stock-subtitle">A baixa ocorre somente quando o orçamento é aprovado.</p></div><button className="button soft" onClick={clearPartDraft}>＋ Nova peça</button></div>
              <div className="stock-summary"><div><span>Peças cadastradas</span><strong>{parts.length}</strong></div><div><span>Disponíveis</span><strong>{parts.filter((part) => part.stockQuantity > 0).length}</strong></div><div><span>Indisponíveis</span><strong>{parts.filter((part) => part.stockQuantity <= 0).length}</strong></div></div>
              <div className="stock-table">
                <div className="stock-head"><span>Código</span><span>Peça</span><span>Estoque</span><span>Valor de venda</span><span>Situação</span><span>Ações</span></div>
                {parts.map((part) => <div className={`stock-row ${part.stockQuantity <= 0 ? "out-of-stock" : ""}`} key={part.id}><code>{part.code}</code><strong>{part.description}</strong><b>{part.stockQuantity} un.</b><span>{money(part.unitPrice)}</span><em className={`stock-status ${part.stockQuantity > 0 ? "available" : "unavailable"}`}>{part.stockQuantity > 0 ? "Disponível" : "Indisponível"}</em><div className="stock-actions"><button className="add-to-budget" disabled={part.stockQuantity <= 0} onClick={() => addPartToBudget(part)}>＋ Orçamento</button><button onClick={() => setPartDraft(part)}>Editar</button><button className="delete-service" onClick={() => removePart(part)}>Excluir</button></div></div>)}
                {!parts.length && <div className="empty-history"><strong>Nenhuma peça cadastrada</strong><span>Adicione a primeira peça ao estoque.</span></div>}
              </div>
            </div>
          </section>
        )}

        {tab === "billing" && <BillingOverview />}

        {tab === "settings" && (
          <section className="settings-layout">
            <div className="settings-menu card">
              <button className="active">Empresa</button>
              <button>Preferências</button>
              <button>Numeração</button>
            </div>
            <div className="card settings-form">
              <div className="section-title">
                <span>ID</span>
                <div>
                  <h2>Dados da empresa</h2>
                  <p>Estas informações aparecem no orçamento</p>
                </div>
              </div>
              <div className="logo-upload">
                <img src={brandLogo} alt={`Logo de ${appSettings.companyName}`} />
                <div>
                  <strong>Logotipo da empresa</strong>
                  <p>{appSettings.logoDataUrl ? "Logo personalizada aplicada ao sistema e aos PDFs." : "Esta é a logo padrão. Troque pela logo da sua marca."}</p>
                  <input ref={logoInputRef} className="logo-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => chooseLogo(event.target.files?.[0])} />
                  <button
                    className="button ghost"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {appSettings.logoDataUrl ? "Alterar logotipo" : "Escolher minha logo"}
                  </button>
                  {appSettings.logoDataUrl && <button className="button danger remove-logo-button" onClick={() => updateAppSetting("logoDataUrl", "")}>Usar logo padrão</button>}
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Nome da empresa
                  <input value={appSettings.companyName} onChange={(event) => updateAppSetting("companyName", event.target.value)} />
                </label>
                <label>
                  Nome do sistema
                  <input value={appSettings.appName} onChange={(event) => updateAppSetting("appName", event.target.value)} />
                </label>
                <label>
                  Segmento
                  <input value={appSettings.segment} onChange={(event) => updateAppSetting("segment", event.target.value)} />
                </label>
                <label>
                  CNPJ
                  <input value={appSettings.document} onChange={(event) => updateAppSetting("document", event.target.value)} />
                </label>
                <label>
                  Telefone
                  <input value={appSettings.phone} onChange={(event) => updateAppSetting("phone", event.target.value)} />
                </label>
                <label>
                  E-mail
                  <input value={appSettings.email} onChange={(event) => updateAppSetting("email", event.target.value)} />
                </label>
                <label className="full">
                  Endereço
                  <input value={appSettings.address} onChange={(event) => updateAppSetting("address", event.target.value)} />
                </label>
              </div>
              <button
                className="button primary"
                onClick={saveAppSettings}
              >
                Salvar alterações
              </button>
            </div>
          </section>
        )}
      </main>
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
