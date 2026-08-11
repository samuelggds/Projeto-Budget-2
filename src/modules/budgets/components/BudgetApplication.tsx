import { useEffect, useMemo, useRef, useState } from "react";
import type { Budget, BudgetItem as Item } from "../types/Budget";
import { deletePdf, getPdf, savePdf } from "../../pdf/services/pdfStorage";
import {
  createInitialBudget,
  createNextBudget,
} from "../services/budgetFactory";
import {
  calculateBudgetTotal,
  calculateFinalTotal,
  formatMoney as money,
} from "../services/budgetCalculations";
import { filterBudgets } from "../../history/services/filterBudgets";
import { createBudgetPdf, downloadPdfBlob } from "../../pdf/services/budgetPdf";
import type { Client } from "../../clients/types/Client";
import type { Service } from "../../services/types/Service";
import { getAllowedNextStatuses } from "../services/budgetStatus";
import {
  changeAccountEmail,
  changeAccountPassword,
  getFuncionarioEmail,
  updateFuncionarioAuth,
  supabase,
} from "../../auth/services/supabase";
import {
  approveBudgetAndDeductStock,
  cancelApprovedBudget,
  restoreCancelledBudget,
  deleteBudgetFromDatabase,
  deleteEmployeeFromDatabase,
  deletePartFromDatabase,
  deleteServiceFromDatabase,
  deleteSupplierFromDatabase,
  loadDatabase,
  loadEmployeesFromDatabase,
  loadNextBudgetNumber,
  loadPaymentHistoryFromDatabase,
  loadPartsFromDatabase,
  loadSuppliersFromDatabase,
  saveAppSettingsToDatabase,
  saveBudgetToDatabase,
  saveClientToDatabase,
  savePartToDatabase,
  saveServiceToDatabase,
  saveEmployeeToDatabase,
  markPayeePaymentAsPaid,
  saveSupplierToDatabase,
  deletePaymentHistoryEntry,
} from "../../shared/services/supabaseDatabase";
import { SmoothSelect } from "../../shared/components/SmoothSelect";
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
} from "../../settings/types/AppSettings";
import type { Part } from "../../stock/types/Part";
import { BillingOverview } from "../../billing/components/BillingOverview";
import { GracePeriodBanner } from "../../billing/components/GracePeriodBanner";
import { FinancialPanel } from "./FinancialPanel";
import { MaintenancePlans } from "../../maintenance/components/MaintenancePlans";
import { useAppRole } from "../../auth/context/appAccessContext";
import { PasswordInput } from "../../shared/components/PasswordInput";
import { ReceiptsTab } from "../../receipts/components/ReceiptsTab";
import type { Supplier } from "../../suppliers/types/Supplier";
import type { Employee } from "../../employees/types/Employee";
import type {
  PaymentHistory,
  PayeeType,
} from "../../payments/types/PaymentHistory";
import { daysUntilPayment } from "../../payments/services/paymentAlerts";
import type { DiscountPreset } from "../types/DiscountPreset";

const withDefaultItemUnit = (current: Budget): Budget => ({
  ...current,
  items: current.items.map((item) => ({ ...item, unit: item.unit || "un." })),
});

const onlyDigits = (value: string) => value.replace(/\D/g, "");

function hasValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const digit = (length: number) => {
    const sum = cpf
      .slice(0, length)
      .split("")
      .reduce(
        (total, numberValue, index) =>
          total + Number(numberValue) * (length + 1 - index),
        0,
      );
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function hasValidCnpj(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calculateDigit = (base: string, weights: number[]) => {
    const sum = base
      .split("")
      .reduce(
        (total, numberValue, index) =>
          total + Number(numberValue) * weights[index],
        0,
      );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = calculateDigit(
    cnpj.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const second = calculateDigit(
    `${cnpj.slice(0, 12)}${first}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return first === Number(cnpj[12]) && second === Number(cnpj[13]);
}

const hasValidDocument = (value: string) =>
  hasValidCpf(value) || hasValidCnpj(value);
const hasValidPhone = (value: string) => {
  const phone = onlyDigits(value);
  return (
    (phone.length === 10 || phone.length === 11) && !/^(\d)\1+$/.test(phone)
  );
};
const hasValidPixKey = (value: string) => {
  const key = value.trim();
  if (!key) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return true;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key,
    )
  )
    return true;
  if (hasValidDocument(key) || hasValidPhone(key)) return true;
  return key.length >= 8 && key.length <= 77 && !/\s/.test(key);
};

type PaymentRegistration = Pick<
  Supplier,
  | "name"
  | "document"
  | "phone"
  | "paymentMethod"
  | "pixKey"
  | "paymentDate"
  | "paymentAmount"
>;

function validatePaymentRegistration(data: PaymentRegistration, label: string) {
  if (data.name.trim().length < 3)
    return `Informe um nome válido para ${label}`;
  if (!hasValidDocument(data.document)) return "Informe um CPF ou CNPJ válido";
  if (!hasValidPhone(data.phone)) return "Informe um telefone válido com DDD";
  if (!data.paymentMethod) return "Selecione a forma de pagamento";
  if (!hasValidPixKey(data.pixKey)) return "Informe uma chave Pix válida";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.paymentDate))
    return "Informe a data de pagamento";
  if (!Number.isFinite(data.paymentAmount) || data.paymentAmount <= 0)
    return "Informe um valor maior que zero";
  return "";
}

/** Returns today + 15 days as YYYY-MM-DD — default for new employee payment date. */
function nextBiweeklyDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

export function BudgetApplication() {
  const appRole = useAppRole();
  const isEmployee = appRole === "FUNCIONARIO";
  const [tab, setTab] = useState<
    | "new"
    | "saved"
    | "clients"
    | "services"
    | "stock"
    | "suppliers"
    | "employees"
    | "billing"
    | "financeiro"
    | "manutencao"
    | "settings"
    | "recibos"
  >("new");
  const [preview, setPreview] = useState(false);
  const [historyReadOnly, setHistoryReadOnly] = useState(false);
  const [budget, setBudget] = useState<Budget>(createInitialBudget);
  const [saved, setSaved] = useState<Budget[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [periodFilter, setPeriodFilter] = useState("Todos");
  const [historyVisibleCount, setHistoryVisibleCount] = useState(5);
  const [toast, setToast] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [today, setToday] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const [clientDraft, setClientDraft] = useState<Client>({
    id: "",
    name: "",
    document: "",
    phone: "",
    email: "",
    contact: "",
    address: "",
    city: "",
    state: "CE",
    cep: "",
  });
  const [serviceDraft, setServiceDraft] = useState<Service>({
    id: "",
    code: "",
    description: "",
    unit: "un.",
    unitPrice: 0,
  });
  const [appSettings, setAppSettings] = useState<AppSettings>({
    ...DEFAULT_APP_SETTINGS,
  });
  const [parts, setParts] = useState<Part[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierHistorySearch, setSupplierHistorySearch] = useState("");
  const [supplierHistoryCount, setSupplierHistoryCount] = useState(5);
  const [supplierDraft, setSupplierDraft] = useState<Supplier>({
    id: "",
    name: "",
    document: "",
    phone: "",
    paymentMethod: "PIX",
    pixKey: "",
    paymentDate: "",
    paymentAmount: 0,
    nextPaymentDate: "",
  });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeHistorySearch, setEmployeeHistorySearch] = useState("");
  const [employeeHistoryCount, setEmployeeHistoryCount] = useState(5);
  const [employeeDraft, setEmployeeDraft] = useState<Employee>({
    id: "",
    name: "",
    document: "",
    phone: "",
    paymentMethod: "PIX",
    pixKey: "",
    paymentDate: nextBiweeklyDate(),
    paymentAmount: 0,
    nextPaymentDate: "",
  });
  const [partDraft, setPartDraft] = useState<Part>({
    id: "",
    code: "",
    description: "",
    stockQuantity: 0,
    unit: "un",
    unitPrice: 0,
  });
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);
  const [settingsSection, setSettingsSection] = useState<
    "company" | "password" | "email" | "discount" | "employees-auth"
  >("company");
  const [discountDraft, setDiscountDraft] = useState<DiscountPreset>({
    id: "",
    name: "",
    type: "percentage",
    value: 0,
  });
  const [showDiscountPicker, setShowDiscountPicker] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [securitySaving, setSecuritySaving] = useState(false);
  const [emailChangeResult, setEmailChangeResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [funcionarioEmail, setFuncionarioEmail] = useState("");
  const [empNewEmail, setEmpNewEmail] = useState("");
  const [empNewPassword, setEmpNewPassword] = useState("");
  const [empConfirmPassword, setEmpConfirmPassword] = useState("");
  const [empSaving, setEmpSaving] = useState(false);
  const [empResult, setEmpResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const total = useMemo(() => calculateBudgetTotal(budget), [budget]);
  const finalTotal = useMemo(() => calculateFinalTotal(budget), [budget]);
  const filtered = filterBudgets(saved, {
    search,
    status: statusFilter,
    period: periodFilter,
  });
  const visibleBudgets = filtered.slice(0, historyVisibleCount);
  const filteredSuppliers = useMemo(() => {
    const query = supplierSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return suppliers;
    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.document,
        supplier.phone,
        supplier.paymentMethod,
        supplier.pixKey,
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(query)),
    );
  }, [supplierSearch, suppliers]);
  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return employees;
    return employees.filter((employee) =>
      [
        employee.name,
        employee.document,
        employee.phone,
        employee.paymentMethod,
        employee.pixKey,
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(query)),
    );
  }, [employeeSearch, employees]);
  const supplierPaymentAlerts = useMemo(() => {
    const ref = new Date(`${today}T00:00:00`);
    return suppliers.filter(
      (item) =>
        item.nextPaymentDate &&
        daysUntilPayment(item.nextPaymentDate, ref) <= 3,
    );
  }, [suppliers, today]);
  const overdueSuppliers = useMemo(
    () =>
      supplierPaymentAlerts.filter(
        (s) => daysUntilPayment(s.nextPaymentDate) < 0,
      ),
    [supplierPaymentAlerts],
  );
  const dueSoonSuppliers = useMemo(
    () =>
      supplierPaymentAlerts.filter(
        (s) => daysUntilPayment(s.nextPaymentDate) >= 0,
      ),
    [supplierPaymentAlerts],
  );
  const filteredSupplierHistory = useMemo(() => {
    const q = supplierHistorySearch.trim().toLocaleLowerCase("pt-BR");
    return paymentHistory.filter(
      (item) =>
        item.payeeType === "SUPPLIER" &&
        (!q || item.payeeName.toLocaleLowerCase("pt-BR").includes(q)),
    );
  }, [paymentHistory, supplierHistorySearch]);
  const employeePaymentAlerts = useMemo(() => {
    const ref = new Date(`${today}T00:00:00`);
    return employees.filter(
      (item) =>
        item.nextPaymentDate &&
        daysUntilPayment(item.nextPaymentDate, ref) <= 3,
    );
  }, [employees, today]);
  const overdueEmployees = useMemo(
    () =>
      employeePaymentAlerts.filter(
        (e) => daysUntilPayment(e.nextPaymentDate) < 0,
      ),
    [employeePaymentAlerts],
  );
  const dueSoonEmployees = useMemo(
    () =>
      employeePaymentAlerts.filter(
        (e) => daysUntilPayment(e.nextPaymentDate) >= 0,
      ),
    [employeePaymentAlerts],
  );
  const filteredEmployeeHistory = useMemo(() => {
    const q = employeeHistorySearch.trim().toLocaleLowerCase("pt-BR");
    return paymentHistory.filter(
      (item) =>
        item.payeeType === "EMPLOYEE" &&
        (!q || item.payeeName.toLocaleLowerCase("pt-BR").includes(q)),
    );
  }, [paymentHistory, employeeHistorySearch]);

  // Atualiza os alertas de pagamento quando o dia vira à meia-noite
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    function schedule() {
      const now = new Date();
      const msUntilMidnight =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
        ).getTime() -
        now.getTime() +
        1000;
      id = setTimeout(() => {
        setToday(new Date().toISOString().slice(0, 10));
        schedule();
      }, msUntilMidnight);
    }
    schedule();
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    loadDatabase()
      .then((data) => {
        const normalizedBudgets = data.budgets.map(withDefaultItemUnit);
        setClients(data.clients);
        setServices(data.services);
        setSaved(normalizedBudgets);
        setAppSettings(data.settings);
        setParts(data.parts);
        const nextBudget = createNextBudget(normalizedBudgets);
        void loadNextBudgetNumber()
          .then((number) => setBudget({ ...nextBudget, number }))
          .catch(() => setBudget(nextBudget));
      })
      .catch((error: Error) => setDatabaseError(error.message))
      .finally(() => setDatabaseLoading(false));
  }, [isEmployee]);

  useEffect(() => {
    if (isEmployee) return;
    void loadPaymentHistoryFromDatabase()
      .then(setPaymentHistory)
      .catch(() => undefined);
  }, [isEmployee]);

  useEffect(() => {
    if (isEmployee) return;
    void loadEmployeesFromDatabase()
      .then(setEmployees)
      .catch((error: Error) =>
        setToast({
          text: `Erro ao carregar funcionários: ${error.message}`,
          type: "error",
        }),
      );
  }, [isEmployee]);

  useEffect(() => {
    if (isEmployee) return;
    void loadSuppliersFromDatabase()
      .then(setSuppliers)
      .catch((error: Error) =>
        setToast({
          text: `Erro ao carregar fornecedores: ${error.message}`,
          type: "error",
        }),
      );
  }, [isEmployee]);

  useEffect(() => {
    const channel = supabase
      .channel("budget-history-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budgets" },
        () => {
          void loadDatabase().then((data) => {
            const normalizedBudgets = data.budgets.map(withDefaultItemUnit);
            setSaved(normalizedBudgets);
            if (historyReadOnly) {
              setBudget(
                (current) =>
                  normalizedBudgets.find((item) => item.id === current.id) ??
                  current,
              );
            }
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [historyReadOnly]);

  useEffect(() => {
    if (tab !== "services" || !serviceDraft.id) return;

    const scrollTimer = window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.getElementById("service-form")?.focus({ preventScroll: true });
    }, 80);

    return () => window.clearTimeout(scrollTimer);
  }, [serviceDraft.id, tab]);

  const notify = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 2600);
  };

  const updateClient = (field: keyof Budget["client"], value: string) =>
    setBudget((old) => ({ ...old, client: { ...old.client, [field]: value } }));

  const updateItem = (
    id: string,
    field: keyof Item,
    value: string | number,
  ) => {
    let nextValue = value;
    const selectedItem = budget.items.find((item) => item.id === id);
    if (field === "quantity" && selectedItem?.partId) {
      const part = parts.find((item) => item.id === selectedItem.partId);
      if (part) {
        const usedInOtherLines = budget.items
          .filter((item) => item.id !== id && item.partId === part.id)
          .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const availableForLine = Math.max(
          0,
          part.stockQuantity - usedInOtherLines,
        );
        if (Number(value) > availableForLine) {
          nextValue = availableForLine;
          notify(
            `Estoque insuficiente para ${part.description}. Disponível neste orçamento: ${availableForLine} un.`,
            "error",
          );
        }
      }
    }
    setBudget((old) => ({
      ...old,
      items: old.items.map((item) =>
        item.id === id ? { ...item, [field]: nextValue } : item,
      ),
    }));
  };

  const stockValidationError = (current: Budget) => {
    for (const part of parts) {
      const requested = current.items
        .filter((item) => item.partId === part.id)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      if (requested > part.stockQuantity) {
        return `${part.description}: solicitado ${requested} un., disponível ${part.stockQuantity} un.`;
      }
    }
    return "";
  };

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
    const service = services.find(
      (item) =>
        item.code.toLowerCase() === code.trim().toLowerCase() ||
        item.id === code.trim(),
    );
    const part = parts.find(
      (item) =>
        item.code.toLowerCase() === code.trim().toLowerCase() ||
        item.id === code.trim(),
    );
    if (part && part.stockQuantity <= 0)
      return notify(`${part.description} está indisponível no estoque`);
    const alreadyUsed = part
      ? budget.items
          .filter((item) => item.id !== itemId && item.partId === part.id)
          .reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      : 0;
    if (part) {
      if (alreadyUsed >= part.stockQuantity)
        return notify(
          `Todo o estoque de ${part.description} já está neste orçamento`,
        );
    }
    setBudget((old) => ({
      ...old,
      items: old.items.map((item) =>
        item.id !== itemId
          ? item
          : service
            ? {
                ...item,
                serviceId: service.id,
                partId: "",
                serviceCode: service.code,
                description: service.description,
                unit: "un.",
                unitPrice: service.unitPrice,
              }
            : part
              ? {
                  ...item,
                  serviceId: "",
                  partId: part.id,
                  serviceCode: part.code,
                  description: part.description,
                  quantity: Math.min(
                    Math.max(Number(item.quantity) || 1, 1),
                    part.stockQuantity - alreadyUsed,
                  ),
                  unit: `${part.unit}.`,
                  unitPrice: part.unitPrice,
                }
              : { ...item, serviceId: "", partId: "", serviceCode: code },
      ),
    }));
  };

  const registerClient = async () => {
    if (!clientDraft.name.trim()) return notify("Informe o nome do cliente");
    try {
      const current = await saveClientToDatabase({
        ...clientDraft,
        id: clientDraft.id || crypto.randomUUID(),
      });
      setClients([
        current,
        ...clients.filter((item) => item.id !== current.id),
      ]);
      setClientDraft({
        id: "",
        name: "",
        document: "",
        phone: "",
        email: "",
        contact: "",
        address: "",
        city: "",
        state: "CE",
        cep: "",
      });
      notify("Cliente salvo no banco");
    } catch (error) {
      notify(`Erro: ${(error as Error).message}`);
    }
  };

  const clearSupplierDraft = () =>
    setSupplierDraft({
      id: "",
      name: "",
      document: "",
      phone: "",
      paymentMethod: "PIX",
      pixKey: "",
      paymentDate: "",
      paymentAmount: 0,
      nextPaymentDate: "",
    });

  const registerSupplier = async () => {
    const validationError = validatePaymentRegistration(
      supplierDraft,
      "o fornecedor",
    );
    if (validationError) return notify(validationError, "error");
    if (
      suppliers.some(
        (item) =>
          onlyDigits(item.document) === onlyDigits(supplierDraft.document) &&
          item.id !== supplierDraft.id,
      )
    )
      return notify(
        "Este CPF/CNPJ já está cadastrado em fornecedores",
        "error",
      );
    try {
      const current = await saveSupplierToDatabase({
        ...supplierDraft,
        id: supplierDraft.id || crypto.randomUUID(),
      });
      setSuppliers([
        current,
        ...suppliers.filter((item) => item.id !== current.id),
      ]);
      clearSupplierDraft();
      notify(
        supplierDraft.id ? "Fornecedor atualizado" : "Fornecedor cadastrado",
      );
    } catch (error) {
      notify(`Erro ao salvar fornecedor: ${(error as Error).message}`, "error");
    }
  };

  const removeSupplier = async (supplier: Supplier) => {
    if (!window.confirm(`Excluir o fornecedor ${supplier.name}?`)) return;
    try {
      await deleteSupplierFromDatabase(supplier.id);
      setSuppliers((current) =>
        current.filter((item) => item.id !== supplier.id),
      );
      if (supplierDraft.id === supplier.id) clearSupplierDraft();
      notify("Fornecedor excluído");
    } catch (error) {
      notify(
        `Erro ao excluir fornecedor: ${(error as Error).message}`,
        "error",
      );
    }
  };

  const clearEmployeeDraft = () =>
    setEmployeeDraft({
      id: "",
      name: "",
      document: "",
      phone: "",
      paymentMethod: "PIX",
      pixKey: "",
      paymentDate: nextBiweeklyDate(),
      paymentAmount: 0,
      nextPaymentDate: "",
    });

  const registerEmployee = async () => {
    const validationError = validatePaymentRegistration(
      employeeDraft,
      "o funcionário",
    );
    if (validationError) return notify(validationError, "error");
    if (
      employees.some(
        (item) =>
          onlyDigits(item.document) === onlyDigits(employeeDraft.document) &&
          item.id !== employeeDraft.id,
      )
    )
      return notify(
        "Este CPF/CNPJ já está cadastrado em funcionários",
        "error",
      );
    try {
      const current = await saveEmployeeToDatabase({
        ...employeeDraft,
        id: employeeDraft.id || crypto.randomUUID(),
      });
      setEmployees([
        current,
        ...employees.filter((item) => item.id !== current.id),
      ]);
      clearEmployeeDraft();
      notify(
        employeeDraft.id ? "Funcionário atualizado" : "Funcionário cadastrado",
      );
    } catch (error) {
      notify(
        `Erro ao salvar funcionário: ${(error as Error).message}`,
        "error",
      );
    }
  };

  const removeEmployee = async (employee: Employee) => {
    if (!window.confirm(`Excluir o funcionário ${employee.name}?`)) return;
    try {
      await deleteEmployeeFromDatabase(employee.id);
      setEmployees((current) =>
        current.filter((item) => item.id !== employee.id),
      );
      if (employeeDraft.id === employee.id) clearEmployeeDraft();
      notify("Funcionário excluído");
    } catch (error) {
      notify(
        `Erro ao excluir funcionário: ${(error as Error).message}`,
        "error",
      );
    }
  };

  const deleteEmployeeHistoryEntry = async (id: string) => {
    if (!window.confirm("Excluir este registro do histórico?")) return;
    try {
      await deletePaymentHistoryEntry(id);
      setPaymentHistory((current) => current.filter((item) => item.id !== id));
      notify("Registro excluído do histórico");
    } catch (error) {
      notify(`Erro ao excluir: ${(error as Error).message}`, "error");
    }
  };

  const confirmPayeePayment = async (payeeType: PayeeType, payeeId: string) => {
    if (!window.confirm("Confirmar que este pagamento foi realizado?")) return;
    try {
      await markPayeePaymentAsPaid(payeeType, payeeId);
      const [currentSuppliers, currentEmployees, currentHistory] =
        await Promise.all([
          loadSuppliersFromDatabase(),
          loadEmployeesFromDatabase(),
          loadPaymentHistoryFromDatabase(),
        ]);
      setSuppliers(currentSuppliers);
      setEmployees(currentEmployees);
      setPaymentHistory(currentHistory);
      notify("Pagamento confirmado e próximo vencimento calculado");
    } catch (error) {
      notify(
        `Erro ao confirmar pagamento: ${(error as Error).message}`,
        "error",
      );
    }
  };

  const copyPixKey = async (pixKey: string) => {
    try {
      await navigator.clipboard.writeText(pixKey);
      notify("Chave Pix copiada");
    } catch {
      notify("Não foi possível copiar a chave Pix", "error");
    }
  };

  const clearDiscountDraft = () =>
    setDiscountDraft({ id: "", name: "", type: "percentage", value: 0 });

  const saveDiscounts = async (discounts: DiscountPreset[]) => {
    try {
      const updated = await saveAppSettingsToDatabase({
        ...appSettings,
        discounts,
      });
      setAppSettings(updated);
    } catch (error) {
      notify(`Erro ao salvar desconto: ${(error as Error).message}`, "error");
    }
  };

  const registerDiscount = async () => {
    if (!discountDraft.name.trim())
      return notify("Informe o nome do desconto", "error");
    if (!Number.isFinite(discountDraft.value) || discountDraft.value <= 0)
      return notify("Informe um valor maior que zero", "error");
    const updated = discountDraft.id
      ? appSettings.discounts.map((d) =>
          d.id === discountDraft.id ? { ...discountDraft } : d,
        )
      : [
          ...appSettings.discounts,
          { ...discountDraft, id: crypto.randomUUID() },
        ];
    await saveDiscounts(updated);
    clearDiscountDraft();
    notify(discountDraft.id ? "Desconto atualizado" : "Desconto salvo");
  };

  const removeDiscountPreset = async (id: string) => {
    if (!window.confirm("Excluir este desconto?")) return;
    await saveDiscounts(appSettings.discounts.filter((d) => d.id !== id));
    notify("Desconto excluído");
  };

  const applyDiscount = (preset: DiscountPreset) => {
    const amount =
      preset.type === "percentage"
        ? Math.min(total, (total * preset.value) / 100)
        : Math.min(total, preset.value);
    const label =
      preset.type === "percentage" ? `${preset.value}%` : money(preset.value);
    setBudget((current) => ({
      ...current,
      discountLabel: label,
      discountAmount: amount,
    }));
    setShowDiscountPicker(false);
  };

  const removeDiscount = () => {
    setBudget((current) => ({
      ...current,
      discountLabel: undefined,
      discountAmount: undefined,
    }));
  };

  const registerService = async () => {
    if (!serviceDraft.code.trim() || !serviceDraft.description.trim())
      return notify("Informe o código e o serviço");
    if (
      services.some(
        (item) =>
          item.code.toLowerCase() === serviceDraft.code.toLowerCase() &&
          item.id !== serviceDraft.id,
      )
    )
      return notify("Este código já está cadastrado");
    if (
      parts.some(
        (item) => item.code.toLowerCase() === serviceDraft.code.toLowerCase(),
      )
    )
      return notify("Este código já pertence a uma peça do estoque");
    const isEditing = Boolean(serviceDraft.id);
    try {
      const current = await saveServiceToDatabase({
        ...serviceDraft,
        unit: "un.",
        id: serviceDraft.id || crypto.randomUUID(),
      });
      setServices([
        current,
        ...services.filter((item) => item.id !== current.id),
      ]);
      setServiceDraft({
        id: "",
        code: "",
        description: "",
        unit: "un.",
        unitPrice: 0,
      });
      notify(
        isEditing ? "Serviço atualizado no banco" : "Serviço salvo no banco",
      );
    } catch (error) {
      notify(`Erro: ${(error as Error).message}`);
    }
  };

  const editService = (service: Service) => {
    setServiceDraft({ ...service, unit: "un." });
    notify(`Editando o serviço ${service.code}`);
  };

  const clearServiceDraft = () => {
    setServiceDraft({
      id: "",
      code: "",
      description: "",
      unit: "un.",
      unitPrice: 0,
    });
  };

  const clearPartDraft = () =>
    setPartDraft({
      id: "",
      code: "",
      description: "",
      stockQuantity: 0,
      unit: "un",
      unitPrice: 0,
    });

  const registerPart = async () => {
    if (!partDraft.code.trim() || !partDraft.description.trim())
      return notify("Informe o código e a peça");
    if (partDraft.stockQuantity < 0 || partDraft.unitPrice < 0)
      return notify("Quantidade e valor não podem ser negativos");
    if (
      parts.some(
        (item) =>
          item.code.toLowerCase() === partDraft.code.toLowerCase() &&
          item.id !== partDraft.id,
      )
    )
      return notify("Este código já está cadastrado");
    if (
      services.some(
        (item) => item.code.toLowerCase() === partDraft.code.toLowerCase(),
      )
    )
      return notify("Este código já pertence a um serviço");
    try {
      const current = await savePartToDatabase({
        ...partDraft,
        id: partDraft.id || crypto.randomUUID(),
      });
      setParts([current, ...parts.filter((item) => item.id !== current.id)]);
      clearPartDraft();
      notify(
        partDraft.id
          ? "Peça atualizada no estoque"
          : "Peça adicionada ao estoque",
      );
    } catch (error) {
      notify(`Erro: ${(error as Error).message}`);
    }
  };

  const removePart = async (part: Part) => {
    if (!window.confirm(`Excluir a peça ${part.code} — ${part.description}?`))
      return;
    try {
      await deletePartFromDatabase(part.id);
      setParts(parts.filter((item) => item.id !== part.id));
      if (partDraft.id === part.id) clearPartDraft();
      notify("Peça excluída do estoque");
    } catch (error) {
      notify(`Erro: ${(error as Error).message}`);
    }
  };

  const addPartToBudget = (part: Part) => {
    if (part.stockQuantity <= 0) return notify("Esta peça está indisponível");
    const alreadyUsed = budget.items
      .filter((item) => item.partId === part.id)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (alreadyUsed >= part.stockQuantity)
      return notify(
        `Todo o estoque de ${part.description} já está neste orçamento`,
      );
    setBudget((current) => {
      const base = ["Aprovado", "Pago", "Recusado"].includes(current.status)
        ? createNextBudget(saved)
        : current;
      const emptyOnly =
        base.items.length === 1 &&
        !base.items[0].description.trim() &&
        !base.items[0].serviceCode;
      const partItem: Item = {
        id: crypto.randomUUID(),
        serviceId: "",
        partId: part.id,
        serviceCode: part.code,
        description: part.description,
        quantity: 1,
        unit: `${part.unit}.`,
        unitPrice: part.unitPrice,
      };
      return {
        ...base,
        items: emptyOnly ? [partItem] : [...base.items, partItem],
      };
    });
    setPreview(false);
    setTab("new");
    notify(`${part.description} adicionada ao orçamento`);
  };

  const addServiceToBudget = (service: Service) => {
    setBudget((current) => {
      const base = ["Aprovado", "Pago", "Recusado"].includes(current.status)
        ? createNextBudget(saved)
        : current;
      const emptyOnly =
        base.items.length === 1 &&
        !base.items[0].description.trim() &&
        !base.items[0].serviceCode;
      const serviceItem: Item = {
        id: crypto.randomUUID(),
        serviceId: service.id,
        partId: "",
        serviceCode: service.code,
        description: service.description,
        quantity: 1,
        unit: "un.",
        unitPrice: service.unitPrice,
      };
      return {
        ...base,
        items: emptyOnly ? [serviceItem] : [...base.items, serviceItem],
      };
    });
    setPreview(false);
    setTab("new");
    notify(`${service.description} adicionada ao orçamento`);
  };

  const updateAppSetting = (field: keyof AppSettings, value: string) =>
    setAppSettings((current) => ({ ...current, [field]: value }));

  const chooseLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return notify("Selecione uma imagem válida");
    if (file.size > 2 * 1024 * 1024)
      return notify("A logo deve ter no máximo 2 MB");
    const reader = new FileReader();
    reader.onload = () =>
      updateAppSetting("logoDataUrl", String(reader.result || ""));
    reader.onerror = () => notify("Não foi possível carregar a logo");
    reader.readAsDataURL(file);
  };

  const choosePdfBackground = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return notify("Selecione uma imagem válida");
    if (file.size > 5 * 1024 * 1024)
      return notify("A imagem deve ter no máximo 5 MB");
    const reader = new FileReader();
    reader.onload = () =>
      updateAppSetting("pdfBackgroundUrl", String(reader.result || ""));
    reader.onerror = () => notify("Não foi possível carregar a imagem");
    reader.readAsDataURL(file);
  };

  const saveAppSettings = async () => {
    if (
      !appSettings.companyName.trim() ||
      !appSettings.appName.trim() ||
      !appSettings.segment.trim()
    )
      return notify("Preencha os nomes da marca");
    if (appSettings.phone && !hasValidPhone(appSettings.phone))
      return notify(
        "Telefone principal inválido. Use o formato (00) 00000-0000",
        "error",
      );
    if (appSettings.phone2 && !hasValidPhone(appSettings.phone2))
      return notify(
        "Telefone 2 inválido. Use o formato (00) 00000-0000",
        "error",
      );
    if (appSettings.phone3 && !hasValidPhone(appSettings.phone3))
      return notify(
        "Telefone 3 inválido. Use o formato (00) 00000-0000",
        "error",
      );
    if (appSettings.phone4 && !hasValidPhone(appSettings.phone4))
      return notify(
        "Telefone 4 inválido. Use o formato (00) 00000-0000",
        "error",
      );
    try {
      const savedSettings = await saveAppSettingsToDatabase(appSettings);
      setAppSettings(savedSettings);
      notify("Configurações da marca salvas");
    } catch (error) {
      notify(`Erro: ${(error as Error).message}`);
    }
  };

  const passwordChecks = {
    length: newPassword.length >= 8,
    uppercase: /[A-Z]/.test(newPassword),
    lowercase: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword),
  };
  const passwordIsValid = Object.values(passwordChecks).every(Boolean);

  const empPasswordChecks = {
    length: empNewPassword.length >= 8,
    uppercase: /[A-Z]/.test(empNewPassword),
    lowercase: /[a-z]/.test(empNewPassword),
    number: /\d/.test(empNewPassword),
    special: /[^A-Za-z0-9]/.test(empNewPassword),
  };
  const empPasswordIsValid = Object.values(empPasswordChecks).every(Boolean);

  const loadFuncionarios = async () => {
    setEmpResult(null);
    try {
      const email = await getFuncionarioEmail();
      setFuncionarioEmail(email);
    } catch (error) {
      setEmpResult({ ok: false, msg: (error as Error).message });
    }
  };

  const saveEmpAuth = async () => {
    const normalizedEmail = empNewEmail.trim().toLowerCase();
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      return notify("Digite um e-mail válido", "error");
    if (empNewPassword) {
      if (!empPasswordIsValid)
        return notify("A nova senha não atende aos requisitos", "error");
      if (empNewPassword !== empConfirmPassword)
        return notify("A confirmação da senha está diferente", "error");
    }
    if (!normalizedEmail && !empNewPassword)
      return notify("Informe um novo e-mail ou senha", "error");
    setEmpSaving(true);
    setEmpResult(null);
    try {
      await updateFuncionarioAuth(
        normalizedEmail || undefined,
        empNewPassword || undefined,
      );
      if (normalizedEmail) setFuncionarioEmail(normalizedEmail);
      setEmpNewEmail("");
      setEmpNewPassword("");
      setEmpConfirmPassword("");
      setEmpResult({
        ok: true,
        msg: "Dados do funcionário atualizados com sucesso",
      });
    } catch (error) {
      setEmpResult({ ok: false, msg: (error as Error).message });
    } finally {
      setEmpSaving(false);
    }
  };

  const saveNewPassword = async () => {
    if (!currentPassword) return notify("Informe a senha atual", "error");
    if (!passwordIsValid)
      return notify("A nova senha não atende aos requisitos", "error");
    if (newPassword !== confirmPassword)
      return notify("A confirmação da senha está diferente", "error");
    setSecuritySaving(true);
    try {
      await changeAccountPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("Senha alterada com sucesso");
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setSecuritySaving(false);
    }
  };

  const saveNewEmail = async () => {
    const normalizedEmail = newAccountEmail.trim().toLowerCase();
    if (!emailPassword) return notify("Informe a senha atual", "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      return notify("Digite um e-mail válido", "error");
    setSecuritySaving(true);
    setEmailChangeResult(null);
    try {
      await changeAccountEmail(emailPassword, normalizedEmail);
      setEmailPassword("");
      setNewAccountEmail("");
      setEmailChangeResult({
        ok: true,
        msg: `Confirmação enviada para ${normalizedEmail}. Clique no link recebido para concluir a troca.`,
      });
    } catch (error) {
      setEmailChangeResult({ ok: false, msg: (error as Error).message });
    } finally {
      setSecuritySaving(false);
    }
  };

  const brandLogo = appSettings.logoDataUrl || "/logo-placeholder.svg";

  const [fadedLogo, setFadedLogo] = useState("");
  useEffect(() => {
    if (!brandLogo) {
      setFadedLogo("");
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.globalAlpha = 0.75;
      ctx.drawImage(img, 0, 0);
      setFadedLogo(canvas.toDataURL("image/png"));
    };
    img.src = brandLogo;
  }, [brandLogo]);

  const brandInitials =
    appSettings.companyName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "LOGO";

  const advanceStatus = async (nextStatus: Budget["status"]) => {
    if (!getAllowedNextStatuses(budget.status).includes(nextStatus))
      return notify("Mudança de status não permitida");
    const stockError =
      nextStatus === "Aprovado" ? stockValidationError(budget) : "";
    if (stockError)
      return notify(`Estoque insuficiente: ${stockError}`, "error");
    try {
      const updated =
        nextStatus === "Aprovado"
          ? await approveBudgetAndDeductStock(withDefaultItemUnit(budget))
          : await saveBudgetToDatabase({ ...budget, status: nextStatus });
      setBudget(updated);
      setSaved([updated, ...saved.filter((item) => item.id !== updated.id)]);
      if (nextStatus === "Aprovado") setParts(await loadPartsFromDatabase());
      notify(`Status alterado para ${nextStatus}`);
    } catch (error) {
      notify(`Erro: ${(error as Error).message}`);
    }
  };

  const removeService = async (service: Service) => {
    if (
      !window.confirm(
        `Excluir o serviço ${service.code} — ${service.description}?`,
      )
    )
      return;
    try {
      await deleteServiceFromDatabase(service.id);
      setServices(services.filter((item) => item.id !== service.id));
      if (serviceDraft.id === service.id)
        setServiceDraft({
          id: "",
          code: "",
          description: "",
          unit: "un.",
          unitPrice: 0,
        });
      notify("Serviço excluído do banco");
    } catch (error) {
      notify(`Erro: ${(error as Error).message}`);
    }
  };

  const downloadServicesPdf = async () => {
    const element = document.getElementById("service-pdf");
    if (!element) return;
    notify("Gerando planilha em PDF...");
    element.classList.add("is-exporting");
    try {
      const pdf = await createBudgetPdf(
        element,
        `planilha-servicos-${new Date().toISOString().slice(0, 10)}.pdf`,
      );
      await pdf.download();
      notify("Planilha baixada em PDF");
    } finally {
      element.classList.remove("is-exporting");
    }
  };

  const saveBudget = async () => {
    if (!budget.stockDeductedAt) {
      const stockError = stockValidationError(budget);
      if (stockError)
        return notify(
          `Não foi possível salvar. Estoque insuficiente: ${stockError}`,
          "error",
        );
    }
    try {
      const current = await saveBudgetToDatabase(withDefaultItemUnit(budget));
      setBudget(current);
      setSaved([current, ...saved.filter((item) => item.id !== current.id)]);
      notify("Orçamento salvo no banco");
    } catch (error) {
      notify(`Erro: ${(error as Error).message}`);
    }
  };

  const newBudget = async () => {
    const nextBudget = createNextBudget(saved);
    setBudget(nextBudget);
    try {
      const number = await loadNextBudgetNumber();
      setBudget((current) =>
        current.id === nextBudget.id ? { ...current, number } : current,
      );
    } catch {
      notify("Não foi possível confirmar a próxima numeração", "error");
    }
    setHistoryReadOnly(false);
    setPreview(false);
    setTab("new");
  };

  const openBudget = (item: Budget) => {
    setBudget(withDefaultItemUnit(item));
    setTab("new");
    setHistoryReadOnly(isEmployee);
    setPreview(isEmployee);
  };

  const editBudgetFromHistory = (item: Budget) => {
    setBudget(withDefaultItemUnit(item));
    setTab("new");
    setHistoryReadOnly(false);
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
      setSaved(next);
      await deletePdf(item.id);
      notify("Orçamento e PDF excluídos");
    } catch (error) {
      notify(`Erro: ${(error as Error).message}`);
    }
  };

  const handleCancelBudget = async (id: string) => {
    if (
      !window.confirm(
        "Cancelar este orçamento? O estoque das peças será restaurado.",
      )
    )
      return;
    try {
      await cancelApprovedBudget(id);
      const { budgets, parts: updatedParts } = await loadDatabase();
      setSaved(budgets.map(withDefaultItemUnit));
      setParts(updatedParts);
      notify("Orçamento cancelado e estoque restaurado");
    } catch (error) {
      notify(`Erro ao cancelar: ${(error as Error).message}`, "error");
    }
  };

  const handleRestoreBudget = async (id: string) => {
    if (
      !window.confirm(
        "Restaurar este orçamento para Aprovado? O estoque será deduzido novamente.",
      )
    )
      return;
    try {
      await restoreCancelledBudget(id);
      const { budgets, parts: updatedParts } = await loadDatabase();
      setSaved(budgets.map(withDefaultItemUnit));
      setParts(updatedParts);
      notify("Orçamento restaurado com sucesso");
    } catch (error) {
      notify(`Erro ao restaurar: ${(error as Error).message}`, "error");
    }
  };

  const generateAndStorePdf = async () => {
    if (!budget.stockDeductedAt) {
      const stockError = stockValidationError(budget);
      if (stockError)
        return notify(
          `Não foi possível gerar o PDF. Estoque insuficiente: ${stockError}`,
          "error",
        );
    }
    try {
      notify("Gerando PDF...");
      const budgetAtSave = {
        ...withDefaultItemUnit(budget),
        createdAt: budget.createdAt || new Date().toISOString(),
      };
      const persisted = await saveBudgetToDatabase(budgetAtSave);
      setBudget(persisted);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const element = document.getElementById("budget-pdf");
      if (!element)
        throw new Error("Pré-visualização do orçamento não encontrada");

      const pdf = await createBudgetPdf(element, `${persisted.number}.pdf`);
      await pdf.download();

      try {
        await savePdf(persisted.id, pdf.blob);
        const updated = {
          ...withDefaultItemUnit(persisted),
          pdfSavedAt: new Date().toISOString(),
        };
        setBudget(updated);
        setSaved([updated, ...saved.filter((item) => item.id !== updated.id)]);
        notify("Orçamento salvo e PDF baixado");
      } catch (storageError) {
        setSaved([
          persisted,
          ...saved.filter((item) => item.id !== persisted.id),
        ]);
        notify(
          `PDF gerado e baixado, mas não foi possível salvar no cache local: ${(storageError as Error).message}`,
          "error",
        );
      }
    } catch (error) {
      notify(
        `Não foi possível gerar o PDF: ${(error as Error).message}`,
        "error",
      );
    }
  };

  const downloadStoredPdf = async (item: Budget) => {
    const blob = await getPdf(item.id);
    if (!blob) {
      notify("PDF não encontrado. Abra o orçamento e gere novamente.");
      return;
    }
    downloadPdfBlob(blob, `${item.number}.pdf`);
  };

  const downloadReadOnlyPdf = async () => {
    try {
      const storedBlob = await getPdf(budget.id);
      if (storedBlob) {
        downloadPdfBlob(storedBlob, `${budget.number}.pdf`);
        notify("PDF baixado");
        return;
      }

      const element = document.getElementById("budget-pdf");
      if (!element)
        return notify("Não foi possível localizar o orçamento", "error");
      notify("Gerando PDF...");
      const pdf = await createBudgetPdf(element, `${budget.number}.pdf`);
      await pdf.download();
      notify("PDF gerado e baixado");
    } catch (error) {
      notify(`Erro ao gerar PDF: ${(error as Error).message}`, "error");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("Todos");
    setPeriodFilter("Todos");
    setHistoryVisibleCount(5);
  };

  if (databaseLoading)
    return (
      <div className="auth-loading">
        <img src="/logo-placeholder.svg" alt="Logo" />
        <span>Carregando dados do banco...</span>
      </div>
    );

  if (databaseError)
    return (
      <main className="database-error-page">
        <section className="login-card">
          <div className="login-brand">
            <img src="/logo-placeholder.svg" alt="Logo" />
            <div>
              <strong>Erro ao acessar o banco</strong>
              <span>Confira a configuração do Supabase</span>
            </div>
          </div>
          <div className="login-error">{databaseError}</div>
          <p>
            Confirme se as tabelas foram criadas, se o RLS possui as políticas
            indicadas e se as variáveis do arquivo .env estão corretas.
          </p>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            Tentar novamente
          </button>
        </section>
      </main>
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
          <span className="nav-group-label">Orçamentos</span>
          <button className={tab === "new" ? "active" : ""} onClick={newBudget}>
            <i>＋</i>Novo orçamento
          </button>
          <button
            className={tab === "saved" ? "active" : ""}
            onClick={() => setTab("saved")}
          >
            <i>▤</i>
            {isEmployee ? "Histórico" : "Orçamentos"}
          </button>
          <span className="nav-group-label">Cadastros</span>
          <button
            className={tab === "recibos" ? "active" : ""}
            onClick={() => setTab("recibos")}
          >
            <i>✎</i>Recibos
          </button>
          <button
            className={tab === "clients" ? "active" : ""}
            onClick={() => setTab("clients")}
          >
            <i>♙</i>Clientes
          </button>
          <button
            className={tab === "services" ? "active" : ""}
            onClick={() => setTab("services")}
          >
            <i>▦</i>Serviços
          </button>
          <button
            className={tab === "stock" ? "active" : ""}
            onClick={() => setTab("stock")}
          >
            <i>▣</i>Estoque
          </button>
          {!isEmployee && (
            <>
              <span className="nav-group-label">Pagamentos</span>
              <button
                className={tab === "suppliers" ? "active" : ""}
                onClick={() => setTab("suppliers")}
              >
                <i>♧</i>Fornecedores
              </button>
            </>
          )}
          {!isEmployee && (
            <button
              className={tab === "employees" ? "active" : ""}
              onClick={() => setTab("employees")}
            >
              <i>♟</i>Funcionários
            </button>
          )}
          {!isEmployee && (
            <>
              <span className="nav-group-label">Financeiro</span>
              <button
                className={tab === "billing" ? "active" : ""}
                onClick={() => setTab("billing")}
              >
                <i>R$</i>Mensalidade
              </button>
            </>
          )}
          {!isEmployee && (
            <button
              className={tab === "financeiro" ? "active" : ""}
              onClick={() => setTab("financeiro")}
            >
              <i>📊</i>Financeiro
            </button>
          )}
          {!isEmployee && (
            <>
              <span className="nav-group-label">Sistema</span>
              <button
                className={tab === "manutencao" ? "active" : ""}
                onClick={() => setTab("manutencao")}
              >
                <i>🔧</i>Manutenção
              </button>
            </>
          )}
          {!isEmployee && (
            <button
              className={tab === "settings" ? "active" : ""}
              onClick={() => setTab("settings")}
            >
              <i>⚙</i>Configurações
            </button>
          )}
        </nav>
        <div className="profile">
          <span>{brandInitials}</span>
          <div>
            <strong>{appSettings.companyName}</strong>
            <small>{isEmployee ? "Funcionário" : "Administrador"}</small>
          </div>
          <button
            className="logout-button"
            title="Sair"
            onClick={() => void supabase.auth.signOut({ scope: "local" })}
          >
            ↪
          </button>
        </div>
      </aside>

      <main className="workspace">
        {!isEmployee && (
          <GracePeriodBanner onPayClick={() => setTab("billing")} />
        )}
        <header className="topbar">
          <div>
            <p className="eyebrow">PAINEL DE ORÇAMENTOS</p>
            <h1>
              {tab === "new"
                ? preview
                  ? "Pré-visualização"
                  : "Novo orçamento"
                : tab === "saved"
                  ? isEmployee
                    ? "Histórico de orçamentos"
                    : "Orçamentos"
                  : tab === "clients"
                    ? "Clientes"
                    : tab === "services"
                      ? "Catálogo de serviços"
                      : tab === "stock"
                        ? "Estoque de peças"
                        : tab === "suppliers"
                          ? "Fornecedores"
                          : tab === "employees"
                            ? "Funcionários"
                            : tab === "billing"
                              ? "Mensalidade"
                              : tab === "financeiro"
                                ? "Financeiro"
                                : tab === "manutencao"
                                  ? "Planos de Manutenção"
                                  : tab === "recibos"
                                    ? "Recibos"
                                    : "Configurações"}
            </h1>
            <p>
              {tab === "new"
                ? "Preencha os dados e gere uma proposta profissional."
                : tab === "saved"
                  ? isEmployee
                    ? "Consulte, abra e baixe os orçamentos salvos por sua conta."
                    : "Consulte e gerencie suas propostas comerciais."
                  : tab === "clients"
                    ? isEmployee
                      ? "Consulte os dados dos clientes cadastrados."
                      : "Cadastre os clientes que serão usados nos orçamentos."
                    : tab === "services"
                      ? isEmployee
                        ? "Consulte os códigos e valores dos serviços cadastrados."
                        : "Cadastre códigos, descrições e valores para preenchimento automático."
                      : tab === "stock"
                        ? isEmployee
                          ? "Consulte códigos, valores e quantidades disponíveis em estoque."
                          : "Cadastre peças para venda e adicione-as aos orçamentos."
                        : tab === "suppliers"
                          ? "Cadastre e acompanhe os dados de pagamento dos fornecedores."
                          : tab === "employees"
                            ? "Cadastre e consulte os dados de pagamento dos funcionários."
                            : tab === "billing"
                              ? "Acompanhe vencimentos, pagamentos e faturas da assinatura."
                              : tab === "financeiro"
                                ? "Acompanhe o faturamento mensal e o total acumulado dos orçamentos."
                                : tab === "manutencao"
                                  ? "Cadastre equipamentos e visualize as próximas manutenções no calendário."
                                  : tab === "recibos"
                                    ? "Emita, salve e baixe recibos em PDF formato A4."
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
                  Horário do salvamento
                  <input
                    className="creation-time-input"
                    value={
                      budget.createdAt
                        ? new Date(budget.createdAt).toLocaleTimeString(
                            "pt-BR",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            },
                          )
                        : "Será registrado ao salvar"
                    }
                    readOnly
                    aria-readonly="true"
                    title="Horário registrado automaticamente no primeiro salvamento"
                  />
                </label>
                <label>
                  Validade
                  <SmoothSelect
                    ariaLabel="Validade"
                    value={String(budget.validDays)}
                    onChange={(value) =>
                      setBudget({ ...budget, validDays: Number(value) })
                    }
                    options={[
                      { value: "5", label: "5 dias" },
                      { value: "10", label: "10 dias" },
                      { value: "15", label: "15 dias" },
                      { value: "30", label: "30 dias" },
                    ]}
                  />
                </label>
                <label className="full">
                  Técnico responsável
                  <input
                    placeholder="Ex.: João da Silva"
                    value={budget.technicianName}
                    onChange={(event) =>
                      setBudget({
                        ...budget,
                        technicianName: event.target.value,
                      })
                    }
                  />
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
                  <SmoothSelect
                    ariaLabel="Selecionar cliente"
                    value={budget.client.id || ""}
                    onChange={selectClient}
                    options={[
                      { value: "", label: "Preencher manualmente" },
                      ...clients.map((client) => ({
                        value: client.id,
                        label: `${client.name} · ${client.document || "sem documento"}`,
                      })),
                    ]}
                  />
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
                      onChange={(e) =>
                        fillServiceByCode(item.id, e.target.value)
                      }
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
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(item.id, "quantity", Number(e.target.value))
                      }
                    />
                    <input
                      value={item.unit}
                      readOnly
                      aria-label="Unidade do item"
                    />
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
                  {services.map((service) => (
                    <option key={`service-${service.id}`} value={service.code}>
                      Mão de obra · {service.description}
                    </option>
                  ))}
                  {parts
                    .filter((part) => part.stockQuantity > 0)
                    .map((part) => (
                      <option key={`part-${part.id}`} value={part.code}>
                        Peça · {part.description} · estoque {part.stockQuantity}
                      </option>
                    ))}
                </datalist>
              </div>
              <div className="total-area">
                <div className="discount-section">
                  {budget.discountAmount ? (
                    <div className="discount-applied">
                      <div className="discount-applied-row">
                        <span>Subtotal</span>
                        <span>{money(total)}</span>
                      </div>
                      <div className="discount-applied-row">
                        <span>{budget.discountLabel}</span>
                        <div className="discount-applied-value">
                          <span>− {money(budget.discountAmount)}</span>
                          <button
                            className="remove-discount-btn"
                            onClick={removeDiscount}
                            title="Remover desconto"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="discount-trigger">
                      <button
                        className="button ghost"
                        onClick={() => setShowDiscountPicker((v) => !v)}
                      >
                        ％ Desconto
                      </button>
                      {showDiscountPicker && (
                        <div className="discount-picker">
                          {appSettings.discounts.length === 0 ? (
                            <p className="discount-empty">
                              Nenhum desconto cadastrado. Configure em
                              Configurações → Desconto.
                            </p>
                          ) : (
                            appSettings.discounts.map((preset) => (
                              <button
                                key={preset.id}
                                className="discount-option"
                                onClick={() => applyDiscount(preset)}
                              >
                                <strong>{preset.name}</strong>
                                <span>
                                  {preset.type === "percentage"
                                    ? `${preset.value}%`
                                    : money(preset.value)}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="total-box">
                  <span>
                    {budget.discountAmount ? "Total" : "Total do orçamento"}
                  </span>
                  <strong>{money(finalTotal)}</strong>
                </div>
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
                  <SmoothSelect
                    className="payment-method-select"
                    ariaLabel="Condição de pagamento"
                    value={
                      ["Depósito", "PIX", "Boleto", "Transferência"].includes(
                        budget.payment,
                      )
                        ? budget.payment
                        : ""
                    }
                    onChange={(value) =>
                      setBudget({ ...budget, payment: value })
                    }
                    options={[
                      {
                        value: "",
                        label: "Selecione a forma de pagamento",
                        disabled: true,
                      },
                      { value: "Depósito", label: "Depósito" },
                      { value: "PIX", label: "PIX" },
                      { value: "Boleto", label: "Boleto" },
                      { value: "Transferência", label: "Transferência" },
                    ]}
                  />
                </label>
                <label>
                  Status
                  <input value={budget.status} readOnly />
                </label>
                {!isEmployee && (
                  <div className="status-actions full">
                    <span>Próxima etapa</span>
                    {getAllowedNextStatuses(budget.status)
                      .filter((status) => status !== "Recusado")
                      .map((status) => (
                        <button
                          key={status}
                          className="button primary"
                          onClick={() => advanceStatus(status)}
                        >
                          Avançar para {status}
                        </button>
                      ))}
                    {getAllowedNextStatuses(budget.status).includes(
                      "Recusado",
                    ) && (
                      <button
                        className="button danger"
                        onClick={() => advanceStatus("Recusado")}
                      >
                        Marcar como recusado
                      </button>
                    )}
                    {getAllowedNextStatuses(budget.status).length === 0 && (
                      <strong>Status final: {budget.status}</strong>
                    )}
                  </div>
                )}
                <label className="full">
                  Observações
                  <textarea
                    placeholder="Digite aqui suas observações!"
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
              {appSettings.pdfBackgroundUrl && (
                <div
                  className="paper-bg"
                  style={{
                    backgroundImage: `url(${appSettings.pdfBackgroundUrl})`,
                  }}
                />
              )}
              <div className="paper-head">
                <img
                  src={fadedLogo || brandLogo}
                  alt={`Logo de ${appSettings.companyName}`}
                />
                <div>
                  <h2>{appSettings.companyName.toUpperCase()}</h2>
                  <p>{appSettings.address || "Endereço não informado"}</p>
                  <p>
                    {[
                      { label: "Tel. 1", value: appSettings.phone },
                      { label: "Tel. 2", value: appSettings.phone2 },
                      { label: "Tel. 3", value: appSettings.phone3 },
                      { label: "Tel. 4", value: appSettings.phone4 },
                    ]
                      .filter((t) => t.value)
                      .map((t) => `${t.label}: ${t.value}`)
                      .join(" · ") || "Telefone não informado"}
                  </p>
                  <p>
                    {appSettings.document
                      ? `CNPJ/CPF ${appSettings.document}`
                      : "Documento não informado"}{" "}
                    · {appSettings.email || "E-mail não informado"}
                  </p>
                </div>
                <div className="paper-number">
                  <div className="paper-technician">
                    <span>TÉCNICO RESPONSÁVEL</span>
                    <b>{budget.technicianName || "Não informado"}</b>
                  </div>
                  <span>ORÇAMENTO DE SERVIÇOS E PEÇAS</span>
                  <strong>{budget.number}</strong>
                  <small>
                    Emissão:{" "}
                    {new Date(`${budget.issuedAt}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}
                  </small>
                  <small>
                    Salvo às{" "}
                    {budget.createdAt
                      ? new Date(budget.createdAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : "aguardando salvamento"}
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
                      <td>{item.description || "Item ou serviço"}</td>
                      <td>{item.quantity}</td>
                      <td>{item.unit}</td>
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
                  {budget.discountAmount ? (
                    <>
                      <p>
                        <span>Subtotal:</span> {money(total)}
                      </p>
                      <p>
                        <span>Desconto de {budget.discountLabel}:</span>{" "}
                        {money(budget.discountAmount)}
                      </p>
                      <span>VALOR TOTAL</span>
                      <strong>{money(finalTotal)}</strong>
                    </>
                  ) : (
                    <>
                      <span>VALOR TOTAL</span>
                      <strong>{money(total)}</strong>
                    </>
                  )}
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
              <strong>
                {preview
                  ? "Pré-visualização do orçamento"
                  : "Orçamento pronto?"}
              </strong>
              <span>
                {preview
                  ? "Confira o documento antes de salvar ou baixar o PDF."
                  : "Antes de baixar e salvar , visualize o documento e veja se está correto!"}
              </span>
            </div>
            {historyReadOnly ? (
              <button className="button primary" onClick={downloadReadOnlyPdf}>
                ↧ Baixar PDF
              </button>
            ) : (
              <button
                className="button ghost"
                onClick={() => setPreview(!preview)}
              >
                {preview ? "← Voltar para edição" : "◉ Visualizar"}
              </button>
            )}
            {!historyReadOnly && (
              <button className="button primary" onClick={saveBudget}>
                ✓ Salvar orçamento
              </button>
            )}
            {!historyReadOnly && preview && (
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
                {isEmployee
                  ? "Seu histórico é somente para consulta. Use os filtros para localizar e baixar um orçamento."
                  : "Use os filtros para encontrar rapidamente sem acumular informações na tela."}
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
                    setHistoryVisibleCount(5);
                  }}
                />
              </div>
              <SmoothSelect
                ariaLabel="Filtrar por status"
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value);
                  setHistoryVisibleCount(5);
                }}
                options={[
                  "Todos",
                  "Enviado",
                  "Recusado",
                  "Em andamento",
                  "Aprovado",
                  "Pago",
                ].map((value) => ({ value, label: value }))}
              />
              <SmoothSelect
                ariaLabel="Filtrar por período"
                value={periodFilter}
                onChange={(value) => {
                  setPeriodFilter(value);
                  setHistoryVisibleCount(5);
                }}
                options={[
                  { value: "Todos", label: "Todo o período" },
                  { value: "7", label: "Últimos 7 dias" },
                  { value: "30", label: "Últimos 30 dias" },
                  { value: "90", label: "Últimos 90 dias" },
                ]}
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
                  <b>{money(calculateFinalTotal(item))}</b>
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
                    <button onClick={() => openBudget(item)}>
                      {isEmployee ? "Visualizar" : "Abrir"}
                    </button>
                    {isEmployee && (
                      <button onClick={() => editBudgetFromHistory(item)}>
                        Editar
                      </button>
                    )}
                    {!isEmployee && item.status === "Aprovado" && (
                      <button
                        className="cancel-action"
                        onClick={() => void handleCancelBudget(item.id)}
                      >
                        Cancelar
                      </button>
                    )}
                    {!isEmployee && item.status === "Cancelado" && (
                      <button
                        className="restore-action"
                        onClick={() => void handleRestoreBudget(item.id)}
                      >
                        Restaurar
                      </button>
                    )}
                    {!isEmployee && (
                      <button
                        className="delete-action"
                        onClick={() => removeBudget(item)}
                      >
                        Excluir
                      </button>
                    )}
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
            {filtered.length > 5 && (
              <div className="load-controls">
                <span>
                  Exibindo {Math.min(historyVisibleCount, filtered.length)} de{" "}
                  {filtered.length}
                </span>
                {historyVisibleCount > 5 && (
                  <button
                    className="button ghost"
                    onClick={() => setHistoryVisibleCount(5)}
                  >
                    ← Voltar ao início
                  </button>
                )}
                {historyVisibleCount < filtered.length && (
                  <button
                    className="button primary"
                    onClick={() => setHistoryVisibleCount((count) => count + 5)}
                  >
                    Carregar mais 5
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {tab === "clients" && (
          <section
            className={`registry-layout ${isEmployee ? "read-only-registry" : ""}`}
          >
            {!isEmployee && (
              <div className="card registry-form">
                <div className="section-title">
                  <span>01</span>
                  <div>
                    <h2>Cadastro de cliente</h2>
                    <p>Dados armazenados para reutilização</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="wide">
                    Nome / Razão social
                    <input
                      value={clientDraft.name}
                      onChange={(e) =>
                        setClientDraft({ ...clientDraft, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    CPF / CNPJ
                    <input
                      value={clientDraft.document}
                      onChange={(e) =>
                        setClientDraft({
                          ...clientDraft,
                          document: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      value={clientDraft.phone}
                      onChange={(e) =>
                        setClientDraft({
                          ...clientDraft,
                          phone: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    E-mail
                    <input
                      value={clientDraft.email}
                      onChange={(e) =>
                        setClientDraft({
                          ...clientDraft,
                          email: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Contato
                    <input
                      value={clientDraft.contact}
                      onChange={(e) =>
                        setClientDraft({
                          ...clientDraft,
                          contact: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="wide">
                    Endereço
                    <input
                      value={clientDraft.address}
                      onChange={(e) =>
                        setClientDraft({
                          ...clientDraft,
                          address: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Cidade
                    <input
                      value={clientDraft.city}
                      onChange={(e) =>
                        setClientDraft({ ...clientDraft, city: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    UF
                    <input
                      maxLength={2}
                      value={clientDraft.state}
                      onChange={(e) =>
                        setClientDraft({
                          ...clientDraft,
                          state: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                  <label>
                    CEP
                    <input
                      value={clientDraft.cep}
                      onChange={(e) =>
                        setClientDraft({ ...clientDraft, cep: e.target.value })
                      }
                    />
                  </label>
                </div>
                <button
                  className="button primary registry-save"
                  onClick={registerClient}
                >
                  Salvar cliente
                </button>
              </div>
            )}
            <div className="card registry-list">
              <h2>Clientes cadastrados</h2>
              {clients.map((client) => (
                <div className="registry-row" key={client.id}>
                  <div>
                    <strong>{client.name}</strong>
                    <small>
                      {client.document || "Sem documento"} ·{" "}
                      {client.phone || "Sem telefone"}
                    </small>
                  </div>
                  {!isEmployee && (
                    <button onClick={() => setClientDraft(client)}>
                      Editar
                    </button>
                  )}
                </div>
              ))}
              {!clients.length && (
                <p className="registry-empty">Nenhum cliente cadastrado.</p>
              )}
            </div>
          </section>
        )}

        {tab === "services" && (
          <section
            className={`registry-layout ${isEmployee ? "read-only-registry" : ""}`}
          >
            {!isEmployee && (
              <div
                id="service-form"
                tabIndex={-1}
                className={`card registry-form service-form-card ${serviceDraft.id ? "is-editing" : ""}`}
              >
                <div className="section-title">
                  <span>02</span>
                  <div>
                    <h2>
                      {serviceDraft.id
                        ? "Editar serviço"
                        : "Cadastro de serviço"}
                    </h2>
                    <p>
                      {serviceDraft.id
                        ? `Altere os dados de ${serviceDraft.code} e clique em Atualizar serviço`
                        : "Esta tabela será ligada aos IDs do backend"}
                    </p>
                  </div>
                </div>
                {serviceDraft.id && (
                  <div className="editing-service-notice">
                    <strong>✎ Modo de edição ativo</strong>
                    <span>
                      Você está editando o serviço {serviceDraft.code}.
                    </span>
                  </div>
                )}
                <div className="form-grid">
                  <label>
                    Código
                    <input
                      placeholder="Ex.: SRV-001"
                      value={serviceDraft.code}
                      onChange={(e) =>
                        setServiceDraft({
                          ...serviceDraft,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                  <label className="wide">
                    Serviço
                    <input
                      value={serviceDraft.description}
                      onChange={(e) =>
                        setServiceDraft({
                          ...serviceDraft,
                          description: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Unidade
                    <input
                      value="un."
                      readOnly
                      aria-label="Unidade do serviço"
                    />
                  </label>
                  <label>
                    Valor
                    <input
                      type="number"
                      min="0"
                      step=".01"
                      value={serviceDraft.unitPrice || ""}
                      onChange={(e) =>
                        setServiceDraft({
                          ...serviceDraft,
                          unitPrice: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="service-form-actions">
                  <button
                    className="button primary registry-save"
                    onClick={registerService}
                  >
                    {serviceDraft.id ? "✓ Atualizar serviço" : "Salvar serviço"}
                  </button>
                  {serviceDraft.id && (
                    <button
                      className="button ghost registry-save"
                      onClick={clearServiceDraft}
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="card registry-list">
              <div className="registry-title">
                <h2>Planilha de serviços</h2>
                {!isEmployee && (
                  <div className="registry-actions">
                    <button
                      className="button ghost"
                      disabled={!services.length}
                      onClick={downloadServicesPdf}
                    >
                      ↧ Gerar PDF
                    </button>
                    <button
                      className="button soft"
                      onClick={() => {
                        clearServiceDraft();
                        document
                          .getElementById("service-form")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }}
                    >
                      ＋ Adicionar serviço
                    </button>
                  </div>
                )}
              </div>
              <div id="service-pdf" className="services-paper">
                <div className="services-paper-head">
                  <img
                    src={brandLogo}
                    alt={`Logo de ${appSettings.companyName}`}
                  />
                  <div>
                    <h2>PLANILHA DE SERVIÇOS</h2>
                    <p>
                      {appSettings.companyName} · Emitida em{" "}
                      {new Date().toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
                <div className="service-head pdf-service-head">
                  <span>Código</span>
                  <span>Serviço</span>
                  <span>Unidade</span>
                  <span>Valor</span>
                  {!isEmployee && (
                    <span className="service-actions-label">Ações</span>
                  )}
                </div>
                {services.map((service) => (
                  <div
                    className={`service-row pdf-service-row ${serviceDraft.id === service.id ? "is-being-edited" : ""}`}
                    key={service.id}
                  >
                    <code>{service.code}</code>
                    <div>
                      <strong>{service.description}</strong>
                    </div>
                    <span>{service.unit}</span>
                    <b>{money(service.unitPrice)}</b>
                    {!isEmployee && (
                      <div className="service-actions">
                        <button
                          className="add-to-budget"
                          onClick={() => addServiceToBudget(service)}
                        >
                          ＋ Orçamento
                        </button>
                        <button onClick={() => editService(service)}>
                          {serviceDraft.id === service.id
                            ? "Editando..."
                            : "Editar"}
                        </button>
                        <button
                          className="delete-service"
                          onClick={() => removeService(service)}
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <footer>{services.length} serviço(s) cadastrado(s)</footer>
              </div>
              {!services.length && (
                <p className="registry-empty">
                  Cadastre um serviço para usar o preenchimento automático.
                </p>
              )}
            </div>
          </section>
        )}

        {tab === "stock" && (
          <section
            className={`registry-layout stock-layout ${isEmployee ? "read-only-registry" : ""}`}
          >
            {!isEmployee && (
              <div
                className={`card registry-form ${partDraft.id ? "is-editing" : ""}`}
              >
                <div className="section-title">
                  <span>▣</span>
                  <div>
                    <h2>
                      {partDraft.id
                        ? "Editar peça"
                        : "Adicionar peça ao estoque"}
                    </h2>
                    <p>Cadastre peças disponíveis para venda nos orçamentos</p>
                  </div>
                </div>
                {partDraft.id && (
                  <div className="editing-service-notice">
                    <strong>✎ Modo de edição ativo</strong>
                    <span>Atualize os dados de {partDraft.code}.</span>
                  </div>
                )}
                <div className="form-grid">
                  <label>
                    Código
                    <input
                      placeholder="Ex.: PEC-001"
                      value={partDraft.code}
                      onChange={(event) =>
                        setPartDraft({
                          ...partDraft,
                          code: event.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                  <label className="wide">
                    Peça
                    <input
                      placeholder="Nome ou descrição da peça"
                      value={partDraft.description}
                      onChange={(event) =>
                        setPartDraft({
                          ...partDraft,
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Quantidade em estoque
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={partDraft.stockQuantity || ""}
                      onChange={(event) =>
                        setPartDraft({
                          ...partDraft,
                          stockQuantity: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Unidade
                    <select
                      value={partDraft.unit}
                      onChange={(event) =>
                        setPartDraft({
                          ...partDraft,
                          unit: event.target.value as Part["unit"],
                        })
                      }
                    >
                      <option value="un">un — Unidades</option>
                      <option value="m">m — Metros</option>
                      <option value="kg">kg — Quilogramas</option>
                    </select>
                  </label>
                  <label>
                    Valor de venda
                    <input
                      type="number"
                      min="0"
                      step=".01"
                      value={partDraft.unitPrice || ""}
                      onChange={(event) =>
                        setPartDraft({
                          ...partDraft,
                          unitPrice: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="service-form-actions">
                  <button
                    className="button primary registry-save"
                    onClick={registerPart}
                  >
                    {partDraft.id ? "✓ Atualizar peça" : "＋ Salvar peça"}
                  </button>
                  {partDraft.id && (
                    <button
                      className="button ghost registry-save"
                      onClick={clearPartDraft}
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="card registry-list">
              <div className="registry-title">
                <div>
                  <h2>Peças cadastradas</h2>
                  <p className="stock-subtitle">
                    A baixa ocorre somente quando o orçamento é aprovado.
                  </p>
                </div>
                {!isEmployee && (
                  <button className="button soft" onClick={clearPartDraft}>
                    ＋ Nova peça
                  </button>
                )}
              </div>
              <div className="stock-summary">
                <div>
                  <span>Peças cadastradas</span>
                  <strong>{parts.length}</strong>
                </div>
                <div>
                  <span>Disponíveis</span>
                  <strong>
                    {parts.filter((part) => part.stockQuantity > 0).length}
                  </strong>
                </div>
                <div>
                  <span>Indisponíveis</span>
                  <strong>
                    {parts.filter((part) => part.stockQuantity <= 0).length}
                  </strong>
                </div>
              </div>
              <div className="stock-table">
                <div className="stock-head">
                  <span>Código</span>
                  <span>Peça</span>
                  <span>Estoque</span>
                  <span>Valor de venda</span>
                  <span>Situação</span>
                  {!isEmployee && <span>Ações</span>}
                </div>
                {parts.map((part) => (
                  <div
                    className={`stock-row ${part.stockQuantity <= 0 ? "out-of-stock" : ""}`}
                    key={part.id}
                  >
                    <code>{part.code}</code>
                    <strong>{part.description}</strong>
                    <b>
                      {part.stockQuantity} {part.unit}.
                    </b>
                    <span>{money(part.unitPrice)}</span>
                    <em
                      className={`stock-status ${part.stockQuantity > 0 ? "available" : "unavailable"}`}
                    >
                      {part.stockQuantity > 0 ? "Disponível" : "Indisponível"}
                    </em>
                    {!isEmployee && (
                      <div className="stock-actions">
                        <button
                          className="add-to-budget"
                          disabled={part.stockQuantity <= 0}
                          onClick={() => addPartToBudget(part)}
                        >
                          ＋ Orçamento
                        </button>
                        <button onClick={() => setPartDraft(part)}>
                          Editar
                        </button>
                        <button
                          className="delete-service"
                          onClick={() => removePart(part)}
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {!parts.length && (
                  <div className="empty-history">
                    <strong>Nenhuma peça cadastrada</strong>
                    <span>Adicione a primeira peça ao estoque.</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "suppliers" && !isEmployee && (
          <section className="registry-layout supplier-layout">
            {overdueSuppliers.length > 0 && (
              <div className="payment-alerts payment-alerts-overdue full-registry-width">
                <div className="payment-alert-title">
                  <div>
                    <strong>⚠ Pagamentos em atraso</strong>
                    <span>
                      Fornecedores com pagamento fora do prazo — ciclo mensal
                    </span>
                  </div>
                  <em>{overdueSuppliers.length}</em>
                </div>
                {overdueSuppliers.map((supplier) => {
                  const days = daysUntilPayment(supplier.nextPaymentDate);
                  return (
                    <div
                      className="payment-alert-row overdue"
                      key={supplier.id}
                    >
                      <div>
                        <strong>{supplier.name}</strong>
                        <span>{Math.abs(days)} dia(s) em atraso</span>
                      </div>
                      <div>
                        <span>Valor</span>
                        <strong>{money(supplier.paymentAmount)}</strong>
                      </div>
                      <div>
                        <span>Venceu em</span>
                        <strong>
                          {new Date(
                            `${supplier.nextPaymentDate}T12:00:00`,
                          ).toLocaleDateString("pt-BR")}
                        </strong>
                      </div>
                      <div className="payment-pix">
                        <span>Chave Pix</span>
                        <strong title={supplier.pixKey}>
                          {supplier.pixKey}
                        </strong>
                      </div>
                      <div className="payment-alert-actions">
                        <button
                          className="button ghost"
                          onClick={() => void copyPixKey(supplier.pixKey)}
                        >
                          Copiar Pix
                        </button>
                        <button
                          className="button danger"
                          onClick={() =>
                            void confirmPayeePayment("SUPPLIER", supplier.id)
                          }
                        >
                          Marcar como pago
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {dueSoonSuppliers.length > 0 && (
              <div className="payment-alerts full-registry-width">
                <div className="payment-alert-title">
                  <div>
                    <strong>Pagamentos de fornecedores</strong>
                    <span>Vencendo nos próximos 3 dias</span>
                  </div>
                  <em>{dueSoonSuppliers.length}</em>
                </div>
                {dueSoonSuppliers.map((supplier) => {
                  const days = daysUntilPayment(supplier.nextPaymentDate);
                  return (
                    <div
                      className="payment-alert-row due-soon"
                      key={supplier.id}
                    >
                      <div>
                        <strong>{supplier.name}</strong>
                        <span>
                          {days === 0
                            ? "Vence hoje"
                            : `Vence em ${days} dia(s)`}
                        </span>
                      </div>
                      <div>
                        <span>Valor</span>
                        <strong>{money(supplier.paymentAmount)}</strong>
                      </div>
                      <div>
                        <span>Vencimento</span>
                        <strong>
                          {new Date(
                            `${supplier.nextPaymentDate}T12:00:00`,
                          ).toLocaleDateString("pt-BR")}
                        </strong>
                      </div>
                      <div className="payment-pix">
                        <span>Chave Pix</span>
                        <strong title={supplier.pixKey}>
                          {supplier.pixKey}
                        </strong>
                      </div>
                      <div className="payment-alert-actions">
                        <button
                          className="button ghost"
                          onClick={() => void copyPixKey(supplier.pixKey)}
                        >
                          Copiar Pix
                        </button>
                        <button
                          className="button primary"
                          onClick={() =>
                            void confirmPayeePayment("SUPPLIER", supplier.id)
                          }
                        >
                          Marcar como pago
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div
              className={`card registry-form ${supplierDraft.id ? "is-editing" : ""}`}
            >
              <div className="section-title">
                <span>01</span>
                <div>
                  <h2>
                    {supplierDraft.id
                      ? "Editar fornecedor"
                      : "Cadastro de fornecedor"}
                  </h2>
                  <p>Dados financeiros para consulta administrativa</p>
                </div>
              </div>
              {supplierDraft.id && (
                <div className="editing-service-notice">
                  <strong>✎ Modo de edição ativo</strong>
                  <span>Você está editando {supplierDraft.name}.</span>
                </div>
              )}
              <div className="form-grid">
                <label className="wide">
                  Nome / Razão social
                  <input
                    placeholder="Ex.: Fornecedor de peças"
                    value={supplierDraft.name}
                    onChange={(event) =>
                      setSupplierDraft({
                        ...supplierDraft,
                        name: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  CPF / CNPJ
                  <input
                    placeholder="000.000.000-00"
                    value={supplierDraft.document}
                    onChange={(event) =>
                      setSupplierDraft({
                        ...supplierDraft,
                        document: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Telefone
                  <input
                    type="tel"
                    placeholder="(85) 99999-9999"
                    value={supplierDraft.phone}
                    onChange={(event) =>
                      setSupplierDraft({
                        ...supplierDraft,
                        phone: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Forma de pagamento
                  <SmoothSelect
                    ariaLabel="Forma de pagamento do fornecedor"
                    value={supplierDraft.paymentMethod}
                    options={[
                      { value: "PIX", label: "PIX" },
                      { value: "Boleto", label: "Boleto" },
                      { value: "Transferência", label: "Transferência" },
                      { value: "Depósito", label: "Depósito" },
                      { value: "Dinheiro", label: "Dinheiro" },
                    ]}
                    onChange={(value) =>
                      setSupplierDraft({
                        ...supplierDraft,
                        paymentMethod: value,
                      })
                    }
                  />
                </label>
                <label className="wide">
                  Chave Pix
                  <input
                    placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                    value={supplierDraft.pixKey}
                    onChange={(event) =>
                      setSupplierDraft({
                        ...supplierDraft,
                        pixKey: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Data de pagamento
                  <input
                    type="date"
                    value={supplierDraft.paymentDate}
                    onChange={(event) =>
                      setSupplierDraft({
                        ...supplierDraft,
                        paymentDate: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Valor mensal
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0,00"
                    value={supplierDraft.paymentAmount || ""}
                    onChange={(event) =>
                      setSupplierDraft({
                        ...supplierDraft,
                        paymentAmount: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="service-form-actions">
                <button
                  className="button primary registry-save"
                  onClick={registerSupplier}
                >
                  {supplierDraft.id
                    ? "✓ Atualizar fornecedor"
                    : "＋ Salvar fornecedor"}
                </button>
                {supplierDraft.id && (
                  <button
                    className="button ghost registry-save"
                    onClick={clearSupplierDraft}
                  >
                    Cancelar edição
                  </button>
                )}
              </div>
            </div>

            <div className="card registry-list">
              <div className="registry-title supplier-title">
                <div>
                  <h2>Fornecedores cadastrados</h2>
                  <p className="stock-subtitle">
                    Informações visíveis somente para o administrador.
                  </p>
                </div>
                <button className="button soft" onClick={clearSupplierDraft}>
                  ＋ Novo fornecedor
                </button>
              </div>
              <label className="supplier-search">
                Pesquisar fornecedor
                <input
                  type="search"
                  placeholder="Pesquise por nome, CPF/CNPJ, telefone, pagamento ou Pix"
                  value={supplierSearch}
                  onChange={(event) => setSupplierSearch(event.target.value)}
                />
              </label>
              <div className="supplier-table">
                <div className="supplier-row supplier-head">
                  <span>Fornecedor</span>
                  <span>CPF/CNPJ</span>
                  <span>Telefone</span>
                  <span>Pagamento</span>
                  <span>Chave Pix</span>
                  <span>Valor</span>
                  <span>Próximo vencimento</span>
                  <span>Ações</span>
                </div>
                {filteredSuppliers.map((supplier) => {
                  const overdueDays = supplier.nextPaymentDate
                    ? daysUntilPayment(supplier.nextPaymentDate)
                    : null;
                  const isOverdue = overdueDays !== null && overdueDays < 0;
                  return (
                    <div
                      className={`supplier-row${isOverdue ? " row-overdue" : ""}`}
                      key={supplier.id}
                    >
                      <strong>{supplier.name}</strong>
                      <span>{supplier.document || "—"}</span>
                      <span>{supplier.phone || "—"}</span>
                      <span>{supplier.paymentMethod || "—"}</span>
                      <span className="supplier-pix" title={supplier.pixKey}>
                        {supplier.pixKey || "—"}
                      </span>
                      <span>{money(supplier.paymentAmount)}</span>
                      <span>
                        {supplier.nextPaymentDate
                          ? new Date(
                              `${supplier.nextPaymentDate}T12:00:00`,
                            ).toLocaleDateString("pt-BR")
                          : "—"}
                        {isOverdue && (
                          <span className="employee-overdue-tag">
                            {Math.abs(overdueDays!)} dias em atraso
                          </span>
                        )}
                      </span>
                      <div className="supplier-actions">
                        {isOverdue && (
                          <button
                            className="button danger"
                            onClick={() =>
                              void confirmPayeePayment("SUPPLIER", supplier.id)
                            }
                          >
                            Pagar
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSupplierDraft(supplier);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="delete-service"
                          onClick={() => void removeSupplier(supplier)}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!filteredSuppliers.length && (
                  <div className="empty-history">
                    <strong>Nenhum fornecedor encontrado</strong>
                    <span>
                      {supplierSearch
                        ? "Altere os termos da pesquisa."
                        : "Cadastre o primeiro fornecedor."}
                    </span>
                  </div>
                )}
              </div>
              <div className="payment-history-block">
                <h3>Histórico de pagamentos</h3>
                <label className="supplier-search">
                  Filtrar por fornecedor
                  <input
                    type="search"
                    placeholder="Pesquise pelo nome"
                    value={supplierHistorySearch}
                    onChange={(e) => {
                      setSupplierHistorySearch(e.target.value);
                      setSupplierHistoryCount(5);
                    }}
                  />
                </label>
                {filteredSupplierHistory
                  .slice(0, supplierHistoryCount)
                  .map((item) => (
                    <div
                      className="payment-history-row payment-history-paid"
                      key={item.id}
                    >
                      <span className="history-paid-badge">✓ Pago</span>
                      <strong>{item.payeeName}</strong>
                      <span>{money(item.amount)}</span>
                      <span>
                        Vencimento:{" "}
                        {new Date(
                          `${item.dueDate}T12:00:00`,
                        ).toLocaleDateString("pt-BR")}
                      </span>
                      <span>
                        Pago em: {new Date(item.paidAt).toLocaleString("pt-BR")}
                      </span>
                      <button
                        className="button ghost history-delete-btn"
                        onClick={() => void deleteEmployeeHistoryEntry(item.id)}
                        title="Excluir registro"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                {filteredSupplierHistory.length === 0 && (
                  <p className="registry-empty">Nenhum pagamento confirmado.</p>
                )}
                {supplierHistoryCount < filteredSupplierHistory.length && (
                  <button
                    className="button soft history-load-more"
                    onClick={() => setSupplierHistoryCount((n) => n + 5)}
                  >
                    + 5 mais
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "employees" && !isEmployee && (
          <section className="registry-layout supplier-layout">
            {overdueEmployees.length > 0 && (
              <div className="payment-alerts payment-alerts-overdue full-registry-width">
                <div className="payment-alert-title">
                  <div>
                    <strong>⚠ Pagamentos em atraso</strong>
                    <span>
                      Funcionários que não receberam no prazo — ciclo quinzenal
                    </span>
                  </div>
                  <em>{overdueEmployees.length}</em>
                </div>
                {overdueEmployees.map((employee) => {
                  const days = daysUntilPayment(employee.nextPaymentDate);
                  return (
                    <div
                      className="payment-alert-row overdue"
                      key={employee.id}
                    >
                      <div>
                        <strong>{employee.name}</strong>
                        <span>{Math.abs(days)} dia(s) em atraso</span>
                      </div>
                      <div>
                        <span>Valor</span>
                        <strong>{money(employee.paymentAmount)}</strong>
                      </div>
                      <div>
                        <span>Venceu em</span>
                        <strong>
                          {new Date(
                            `${employee.nextPaymentDate}T12:00:00`,
                          ).toLocaleDateString("pt-BR")}
                        </strong>
                      </div>
                      <div className="payment-pix">
                        <span>Chave Pix</span>
                        <strong title={employee.pixKey}>
                          {employee.pixKey}
                        </strong>
                      </div>
                      <div className="payment-alert-actions">
                        <button
                          className="button ghost"
                          onClick={() => void copyPixKey(employee.pixKey)}
                        >
                          Copiar Pix
                        </button>
                        <button
                          className="button danger"
                          onClick={() =>
                            void confirmPayeePayment("EMPLOYEE", employee.id)
                          }
                        >
                          Marcar como pago
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {dueSoonEmployees.length > 0 && (
              <div className="payment-alerts full-registry-width">
                <div className="payment-alert-title">
                  <div>
                    <strong>Pagamentos de funcionários</strong>
                    <span>Vencendo nos próximos 3 dias</span>
                  </div>
                  <em>{dueSoonEmployees.length}</em>
                </div>
                {dueSoonEmployees.map((employee) => {
                  const days = daysUntilPayment(employee.nextPaymentDate);
                  return (
                    <div
                      className="payment-alert-row due-soon"
                      key={employee.id}
                    >
                      <div>
                        <strong>{employee.name}</strong>
                        <span>
                          {days === 0
                            ? "Vence hoje"
                            : `Vence em ${days} dia(s)`}
                        </span>
                      </div>
                      <div>
                        <span>Valor</span>
                        <strong>{money(employee.paymentAmount)}</strong>
                      </div>
                      <div>
                        <span>Vencimento</span>
                        <strong>
                          {new Date(
                            `${employee.nextPaymentDate}T12:00:00`,
                          ).toLocaleDateString("pt-BR")}
                        </strong>
                      </div>
                      <div className="payment-pix">
                        <span>Chave Pix</span>
                        <strong title={employee.pixKey}>
                          {employee.pixKey}
                        </strong>
                      </div>
                      <div className="payment-alert-actions">
                        <button
                          className="button ghost"
                          onClick={() => void copyPixKey(employee.pixKey)}
                        >
                          Copiar Pix
                        </button>
                        <button
                          className="button primary"
                          onClick={() =>
                            void confirmPayeePayment("EMPLOYEE", employee.id)
                          }
                        >
                          Marcar como pago
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div
              className={`card registry-form ${employeeDraft.id ? "is-editing" : ""}`}
            >
              <div className="section-title">
                <span>01</span>
                <div>
                  <h2>
                    {employeeDraft.id
                      ? "Editar funcionário"
                      : "Cadastro de funcionário"}
                  </h2>
                  <p>Cadastro administrativo sem criação de login</p>
                </div>
              </div>
              {employeeDraft.id && (
                <div className="editing-service-notice">
                  <strong>✎ Modo de edição ativo</strong>
                  <span>Você está editando {employeeDraft.name}.</span>
                </div>
              )}
              <div className="form-grid">
                <label className="wide">
                  Nome
                  <input
                    placeholder="Ex.: João da Silva"
                    value={employeeDraft.name}
                    onChange={(event) =>
                      setEmployeeDraft({
                        ...employeeDraft,
                        name: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  CPF / CNPJ
                  <input
                    placeholder="000.000.000-00"
                    value={employeeDraft.document}
                    onChange={(event) =>
                      setEmployeeDraft({
                        ...employeeDraft,
                        document: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Telefone
                  <input
                    type="tel"
                    placeholder="(85) 99999-9999"
                    value={employeeDraft.phone}
                    onChange={(event) =>
                      setEmployeeDraft({
                        ...employeeDraft,
                        phone: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Forma de pagamento
                  <SmoothSelect
                    ariaLabel="Forma de pagamento do funcionário"
                    value={employeeDraft.paymentMethod}
                    options={[
                      { value: "PIX", label: "PIX" },
                      { value: "Transferência", label: "Transferência" },
                      { value: "Depósito", label: "Depósito" },
                      { value: "Dinheiro", label: "Dinheiro" },
                    ]}
                    onChange={(value) =>
                      setEmployeeDraft({
                        ...employeeDraft,
                        paymentMethod: value,
                      })
                    }
                  />
                </label>
                <label className="wide">
                  Chave Pix
                  <input
                    placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                    value={employeeDraft.pixKey}
                    onChange={(event) =>
                      setEmployeeDraft({
                        ...employeeDraft,
                        pixKey: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Primeiro pagamento
                  <input
                    type="date"
                    value={employeeDraft.paymentDate}
                    onChange={(event) =>
                      setEmployeeDraft({
                        ...employeeDraft,
                        paymentDate: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Valor quinzenal
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0,00"
                    value={employeeDraft.paymentAmount || ""}
                    onChange={(event) =>
                      setEmployeeDraft({
                        ...employeeDraft,
                        paymentAmount: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="service-form-actions">
                <button
                  className="button primary registry-save"
                  onClick={registerEmployee}
                >
                  {employeeDraft.id
                    ? "✓ Atualizar funcionário"
                    : "＋ Salvar funcionário"}
                </button>
                {employeeDraft.id && (
                  <button
                    className="button ghost registry-save"
                    onClick={clearEmployeeDraft}
                  >
                    Cancelar edição
                  </button>
                )}
              </div>
            </div>

            <div className="card registry-list">
              <div className="registry-title supplier-title">
                <div>
                  <h2>Funcionários cadastrados</h2>
                  <p className="stock-subtitle">
                    Informações visíveis somente para o administrador.
                  </p>
                </div>
                <button className="button soft" onClick={clearEmployeeDraft}>
                  ＋ Novo funcionário
                </button>
              </div>
              <label className="supplier-search">
                Pesquisar funcionário
                <input
                  type="search"
                  placeholder="Pesquise por nome, CPF/CNPJ, telefone, pagamento ou Pix"
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                />
              </label>
              <div className="supplier-table">
                <div className="supplier-row supplier-head">
                  <span>Funcionário</span>
                  <span>CPF/CNPJ</span>
                  <span>Telefone</span>
                  <span>Pagamento</span>
                  <span>Chave Pix</span>
                  <span>Valor</span>
                  <span>Próximo vencimento</span>
                  <span>Ações</span>
                </div>
                {filteredEmployees.map((employee) => {
                  const overdueDays = employee.nextPaymentDate
                    ? daysUntilPayment(employee.nextPaymentDate)
                    : null;
                  const isOverdue = overdueDays !== null && overdueDays < 0;
                  return (
                    <div
                      className={`supplier-row${isOverdue ? " row-overdue" : ""}`}
                      key={employee.id}
                    >
                      <strong>{employee.name}</strong>
                      <span>{employee.document || "—"}</span>
                      <span>{employee.phone || "—"}</span>
                      <span>{employee.paymentMethod || "—"}</span>
                      <span className="supplier-pix" title={employee.pixKey}>
                        {employee.pixKey || "—"}
                      </span>
                      <span>{money(employee.paymentAmount)}</span>
                      <span>
                        {employee.nextPaymentDate
                          ? new Date(
                              `${employee.nextPaymentDate}T12:00:00`,
                            ).toLocaleDateString("pt-BR")
                          : "—"}
                        {isOverdue && (
                          <span className="employee-overdue-tag">
                            {Math.abs(overdueDays!)} dias em atraso
                          </span>
                        )}
                      </span>
                      <div className="supplier-actions">
                        {isOverdue && (
                          <button
                            className="button danger"
                            onClick={() =>
                              void confirmPayeePayment("EMPLOYEE", employee.id)
                            }
                          >
                            Pagar
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEmployeeDraft(employee);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="delete-service"
                          onClick={() => void removeEmployee(employee)}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!filteredEmployees.length && (
                  <div className="empty-history">
                    <strong>Nenhum funcionário encontrado</strong>
                    <span>
                      {employeeSearch
                        ? "Altere os termos da pesquisa."
                        : "Cadastre o primeiro funcionário."}
                    </span>
                  </div>
                )}
              </div>
              <div className="payment-history-block">
                <h3>Histórico de pagamentos</h3>
                <label className="supplier-search">
                  Filtrar por funcionário
                  <input
                    type="search"
                    placeholder="Pesquise pelo nome"
                    value={employeeHistorySearch}
                    onChange={(e) => {
                      setEmployeeHistorySearch(e.target.value);
                      setEmployeeHistoryCount(5);
                    }}
                  />
                </label>
                {filteredEmployeeHistory
                  .slice(0, employeeHistoryCount)
                  .map((item) => (
                    <div
                      className="payment-history-row payment-history-paid"
                      key={item.id}
                    >
                      <span className="history-paid-badge">✓ Pago</span>
                      <strong>{item.payeeName}</strong>
                      <span>{money(item.amount)}</span>
                      <span>
                        Vencimento:{" "}
                        {new Date(
                          `${item.dueDate}T12:00:00`,
                        ).toLocaleDateString("pt-BR")}
                      </span>
                      <span>
                        Pago em: {new Date(item.paidAt).toLocaleString("pt-BR")}
                      </span>
                      <button
                        className="button ghost history-delete-btn"
                        onClick={() => void deleteEmployeeHistoryEntry(item.id)}
                        title="Excluir registro"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                {filteredEmployeeHistory.length === 0 && (
                  <p className="registry-empty">Nenhum pagamento confirmado.</p>
                )}
                {employeeHistoryCount < filteredEmployeeHistory.length && (
                  <button
                    className="button soft history-load-more"
                    onClick={() => setEmployeeHistoryCount((n) => n + 5)}
                  >
                    + 5 mais
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "billing" && <BillingOverview />}

        {tab === "financeiro" && <FinancialPanel saved={saved} />}

        {tab === "manutencao" && <MaintenancePlans />}

        {tab === "recibos" && <ReceiptsTab />}

        {tab === "settings" && (
          <section className="settings-layout">
            <div className="settings-menu card">
              <button
                className={settingsSection === "company" ? "active" : ""}
                onClick={() => setSettingsSection("company")}
              >
                Empresa
              </button>
              <button
                className={settingsSection === "password" ? "active" : ""}
                onClick={() => setSettingsSection("password")}
              >
                Alterar senha
              </button>
              <button
                className={settingsSection === "email" ? "active" : ""}
                onClick={() => setSettingsSection("email")}
              >
                Alterar e-mail
              </button>
              <button
                className={settingsSection === "discount" ? "active" : ""}
                onClick={() => setSettingsSection("discount")}
              >
                Desconto
              </button>
              <button
                className={settingsSection === "employees-auth" ? "active" : ""}
                onClick={() => {
                  setSettingsSection("employees-auth");
                  void loadFuncionarios();
                }}
              >
                Contas de funcionários
              </button>
            </div>
            {settingsSection === "company" && (
              <div className="card settings-form">
                <div className="section-title">
                  <span>ID</span>
                  <div>
                    <h2>Dados da empresa</h2>
                    <p>Estas informações aparecem no orçamento</p>
                  </div>
                </div>
                <div className="logo-upload">
                  <img
                    src={brandLogo}
                    alt={`Logo de ${appSettings.companyName}`}
                  />
                  <div>
                    <strong>Logotipo da empresa</strong>
                    <p>
                      {appSettings.logoDataUrl
                        ? "Logo personalizada aplicada ao sistema e aos PDFs."
                        : "Esta é a logo padrão. Troque pela logo da sua marca."}
                    </p>
                    <input
                      ref={logoInputRef}
                      className="logo-file-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(event) => chooseLogo(event.target.files?.[0])}
                    />
                    <button
                      className="button ghost"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {appSettings.logoDataUrl
                        ? "Alterar logotipo"
                        : "Escolher minha logo"}
                    </button>
                    {appSettings.logoDataUrl && (
                      <button
                        className="button danger remove-logo-button"
                        onClick={() => updateAppSetting("logoDataUrl", "")}
                      >
                        Usar logo padrão
                      </button>
                    )}
                  </div>
                </div>
                <div className="logo-upload">
                  <div className="pdf-bg-preview">
                    {appSettings.pdfBackgroundUrl ? (
                      <img
                        src={appSettings.pdfBackgroundUrl}
                        alt="Fundo do PDF"
                      />
                    ) : (
                      <span>Sem imagem</span>
                    )}
                  </div>
                  <div>
                    <strong>Imagem de fundo do PDF</strong>
                    <p>
                      {appSettings.pdfBackgroundUrl
                        ? "Imagem aplicada como marca d'água no orçamento."
                        : "Adicione uma imagem de fundo para o PDF do orçamento."}
                    </p>
                    <input
                      ref={bgInputRef}
                      className="logo-file-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) =>
                        choosePdfBackground(event.target.files?.[0])
                      }
                    />
                    <button
                      className="button ghost"
                      onClick={() => bgInputRef.current?.click()}
                    >
                      {appSettings.pdfBackgroundUrl
                        ? "Alterar imagem"
                        : "Escolher imagem"}
                    </button>
                    {appSettings.pdfBackgroundUrl && (
                      <button
                        className="button danger remove-logo-button"
                        onClick={() => updateAppSetting("pdfBackgroundUrl", "")}
                      >
                        Remover imagem
                      </button>
                    )}
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    Nome da empresa
                    <input
                      value={appSettings.companyName}
                      onChange={(event) =>
                        updateAppSetting("companyName", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Nome do sistema
                    <input
                      value={appSettings.appName}
                      onChange={(event) =>
                        updateAppSetting("appName", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Segmento
                    <input
                      value={appSettings.segment}
                      onChange={(event) =>
                        updateAppSetting("segment", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    CNPJ
                    <input
                      value={appSettings.document}
                      onChange={(event) =>
                        updateAppSetting("document", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Telefone principal
                    <input
                      value={appSettings.phone}
                      className={
                        appSettings.phone && !hasValidPhone(appSettings.phone)
                          ? "input-error"
                          : ""
                      }
                      placeholder="(00) 00000-0000"
                      onChange={(event) =>
                        updateAppSetting("phone", event.target.value)
                      }
                    />
                    {appSettings.phone && !hasValidPhone(appSettings.phone) && (
                      <span className="field-error">
                        Formato inválido. Ex.: (85) 99999-9999
                      </span>
                    )}
                  </label>
                  <label>
                    Telefone 2
                    <input
                      placeholder="(00) 00000-0000 (opcional)"
                      value={appSettings.phone2}
                      className={
                        appSettings.phone2 && !hasValidPhone(appSettings.phone2)
                          ? "input-error"
                          : ""
                      }
                      onChange={(event) =>
                        updateAppSetting("phone2", event.target.value)
                      }
                    />
                    {appSettings.phone2 &&
                      !hasValidPhone(appSettings.phone2) && (
                        <span className="field-error">
                          Formato inválido. Ex.: (85) 99999-9999
                        </span>
                      )}
                  </label>
                  <label>
                    Telefone 3
                    <input
                      placeholder="(00) 00000-0000 (opcional)"
                      value={appSettings.phone3}
                      className={
                        appSettings.phone3 && !hasValidPhone(appSettings.phone3)
                          ? "input-error"
                          : ""
                      }
                      onChange={(event) =>
                        updateAppSetting("phone3", event.target.value)
                      }
                    />
                    {appSettings.phone3 &&
                      !hasValidPhone(appSettings.phone3) && (
                        <span className="field-error">
                          Formato inválido. Ex.: (85) 99999-9999
                        </span>
                      )}
                  </label>
                  <label>
                    Telefone 4
                    <input
                      placeholder="(00) 00000-0000 (opcional)"
                      value={appSettings.phone4}
                      className={
                        appSettings.phone4 && !hasValidPhone(appSettings.phone4)
                          ? "input-error"
                          : ""
                      }
                      onChange={(event) =>
                        updateAppSetting("phone4", event.target.value)
                      }
                    />
                    {appSettings.phone4 &&
                      !hasValidPhone(appSettings.phone4) && (
                        <span className="field-error">
                          Formato inválido. Ex.: (85) 99999-9999
                        </span>
                      )}
                  </label>
                  <label>
                    E-mail
                    <input
                      value={appSettings.email}
                      onChange={(event) =>
                        updateAppSetting("email", event.target.value)
                      }
                    />
                  </label>
                  <label className="full">
                    Endereço
                    <input
                      value={appSettings.address}
                      onChange={(event) =>
                        updateAppSetting("address", event.target.value)
                      }
                    />
                  </label>
                </div>
                <button className="button primary" onClick={saveAppSettings}>
                  Salvar alterações
                </button>
              </div>
            )}

            {settingsSection === "password" && (
              <div className="card settings-form security-settings-form">
                <div className="section-title">
                  <span>🔒</span>
                  <div>
                    <h2>Alterar senha</h2>
                    <p>
                      Atualize a senha usada para acessar o painel
                      administrativo
                    </p>
                  </div>
                </div>
                <div className="security-fields">
                  <label>
                    Senha atual
                    <PasswordInput
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) =>
                        setCurrentPassword(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Nova senha
                    <PasswordInput
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </label>
                  <label>
                    Confirmar nova senha
                    <PasswordInput
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="password-validation" aria-live="polite">
                  <strong>A nova senha precisa ter:</strong>
                  <span className={passwordChecks.length ? "valid" : ""}>
                    ✓ Pelo menos 8 caracteres
                  </span>
                  <span className={passwordChecks.uppercase ? "valid" : ""}>
                    ✓ Uma letra maiúscula
                  </span>
                  <span className={passwordChecks.lowercase ? "valid" : ""}>
                    ✓ Uma letra minúscula
                  </span>
                  <span className={passwordChecks.number ? "valid" : ""}>
                    ✓ Um número
                  </span>
                  <span className={passwordChecks.special ? "valid" : ""}>
                    ✓ Um caractere especial
                  </span>
                  <span
                    className={
                      confirmPassword && confirmPassword === newPassword
                        ? "valid"
                        : ""
                    }
                  >
                    ✓ Confirmação igual à nova senha
                  </span>
                </div>
                <button
                  className="button primary"
                  disabled={securitySaving}
                  onClick={saveNewPassword}
                >
                  {securitySaving ? "Alterando..." : "Alterar senha"}
                </button>
              </div>
            )}

            {settingsSection === "email" && (
              <div className="card settings-form security-settings-form">
                <div className="section-title">
                  <span>✉</span>
                  <div>
                    <h2>Alterar e-mail</h2>
                    <p>
                      O novo endereço será usado no próximo acesso ao sistema
                    </p>
                  </div>
                </div>
                <div className="security-fields email-security-fields">
                  <label>
                    Novo e-mail
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="novo@email.com"
                      value={newAccountEmail}
                      onChange={(event) =>
                        setNewAccountEmail(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Senha atual para confirmar
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={emailPassword}
                      onChange={(event) => setEmailPassword(event.target.value)}
                    />
                  </label>
                </div>
                <div className="security-notice">
                  <strong>Confirmação de segurança</strong>
                  <span>
                    O Supabase enviará uma confirmação para o novo endereço. A
                    troca será concluída depois da confirmação.
                  </span>
                </div>
                <button
                  className="button primary"
                  disabled={securitySaving}
                  onClick={saveNewEmail}
                >
                  {securitySaving ? "Enviando..." : "Alterar e-mail"}
                </button>
                {emailChangeResult && (
                  <div
                    className={
                      emailChangeResult.ok ? "security-notice" : "login-error"
                    }
                    style={{ marginTop: 12 }}
                  >
                    <strong>
                      {emailChangeResult.ok
                        ? "✓ Solicitação enviada"
                        : "! Erro na alteração"}
                    </strong>
                    <span>{emailChangeResult.msg}</span>
                  </div>
                )}
              </div>
            )}

            {settingsSection === "discount" && (
              <div className="card settings-form">
                <div className="section-title">
                  <span>％</span>
                  <div>
                    <h2>Descontos</h2>
                    <p>
                      Crie descontos predefinidos para aplicar nos orçamentos
                    </p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="wide">
                    Nome do desconto
                    <input
                      placeholder="Ex.: Desconto especial, Promoção"
                      value={discountDraft.name}
                      onChange={(e) =>
                        setDiscountDraft({
                          ...discountDraft,
                          name: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Tipo
                    <SmoothSelect
                      ariaLabel="Tipo de desconto"
                      value={discountDraft.type}
                      options={[
                        { value: "percentage", label: "Porcentagem (%)" },
                        { value: "fixed", label: "Valor fixo (R$)" },
                      ]}
                      onChange={(value) =>
                        setDiscountDraft({
                          ...discountDraft,
                          type: value as "percentage" | "fixed",
                        })
                      }
                    />
                  </label>
                  <label>
                    Valor
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder={
                        discountDraft.type === "percentage"
                          ? "Ex.: 10"
                          : "Ex.: 50,00"
                      }
                      value={discountDraft.value || ""}
                      onChange={(e) =>
                        setDiscountDraft({
                          ...discountDraft,
                          value: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="service-form-actions">
                  <button
                    className="button primary registry-save"
                    onClick={() => void registerDiscount()}
                  >
                    {discountDraft.id
                      ? "✓ Atualizar desconto"
                      : "＋ Salvar desconto"}
                  </button>
                  {discountDraft.id && (
                    <button
                      className="button ghost registry-save"
                      onClick={clearDiscountDraft}
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>
                <div className="supplier-table discount-table">
                  <div className="supplier-row supplier-head">
                    <span>Nome</span>
                    <span>Tipo</span>
                    <span>Valor</span>
                    <span>Ações</span>
                  </div>
                  {appSettings.discounts.map((discount) => (
                    <div className="supplier-row" key={discount.id}>
                      <strong>{discount.name}</strong>
                      <span>
                        {discount.type === "percentage"
                          ? "Porcentagem"
                          : "Valor fixo"}
                      </span>
                      <span>
                        {discount.type === "percentage"
                          ? `${discount.value}%`
                          : money(discount.value)}
                      </span>
                      <div className="supplier-actions">
                        <button onClick={() => setDiscountDraft(discount)}>
                          Editar
                        </button>
                        <button
                          className="delete-service"
                          onClick={() => void removeDiscountPreset(discount.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                  {!appSettings.discounts.length && (
                    <div className="empty-history">
                      <strong>Nenhum desconto cadastrado</strong>
                      <span>Adicione o primeiro desconto acima.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {settingsSection === "employees-auth" && (
              <div className="card settings-form security-settings-form">
                <div className="section-title">
                  <span>♟</span>
                  <div>
                    <h2>Contas de funcionários</h2>
                    <p>
                      Altere o e-mail ou a senha da conta compartilhada dos
                      funcionários
                    </p>
                  </div>
                </div>
                <div className="security-fields">
                  <label>
                    E-mail atual
                    <input
                      value={funcionarioEmail || "Carregando..."}
                      readOnly
                      aria-readonly="true"
                    />
                  </label>
                  <label>
                    Novo e-mail (opcional)
                    <input
                      type="email"
                      autoComplete="off"
                      placeholder="novo@email.com"
                      value={empNewEmail}
                      onChange={(e) => setEmpNewEmail(e.target.value)}
                    />
                  </label>
                  <label>
                    Nova senha (opcional)
                    <PasswordInput
                      autoComplete="new-password"
                      value={empNewPassword}
                      onChange={(e) => setEmpNewPassword(e.target.value)}
                    />
                  </label>
                  <label>
                    Confirmar nova senha
                    <PasswordInput
                      autoComplete="new-password"
                      value={empConfirmPassword}
                      onChange={(e) => setEmpConfirmPassword(e.target.value)}
                    />
                  </label>
                </div>
                {empNewPassword && (
                  <div className="password-validation" aria-live="polite">
                    <strong>A nova senha precisa ter:</strong>
                    <span className={empPasswordChecks.length ? "valid" : ""}>
                      ✓ Pelo menos 8 caracteres
                    </span>
                    <span
                      className={empPasswordChecks.uppercase ? "valid" : ""}
                    >
                      ✓ Uma letra maiúscula
                    </span>
                    <span
                      className={empPasswordChecks.lowercase ? "valid" : ""}
                    >
                      ✓ Uma letra minúscula
                    </span>
                    <span className={empPasswordChecks.number ? "valid" : ""}>
                      ✓ Um número
                    </span>
                    <span className={empPasswordChecks.special ? "valid" : ""}>
                      ✓ Um caractere especial
                    </span>
                    <span
                      className={
                        empConfirmPassword &&
                        empConfirmPassword === empNewPassword
                          ? "valid"
                          : ""
                      }
                    >
                      ✓ Confirmação igual à nova senha
                    </span>
                  </div>
                )}
                <button
                  className="button primary"
                  disabled={empSaving}
                  onClick={() => void saveEmpAuth()}
                >
                  {empSaving ? "Salvando..." : "Salvar alterações"}
                </button>
                {empResult && (
                  <div
                    className={empResult.ok ? "security-notice" : "login-error"}
                    style={{ marginTop: 12 }}
                  >
                    <strong>{empResult.ok ? "✓ Sucesso" : "! Erro"}</strong>
                    <span>{empResult.msg}</span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === "error" ? "!" : "✓"} {toast.text}
        </div>
      )}
    </div>
  );
}
