import type { Budget, BudgetStatus } from "../../budgets/types/Budget";
import type { Client } from "../../clients/types/Client";
import type { Service } from "../../services/types/Service";
import { supabase } from "../../auth/services/supabase";
import type { AppSettings } from "../../settings/types/AppSettings";
import { DEFAULT_APP_SETTINGS } from "../../settings/types/AppSettings";
import type { Part } from "../../stock/types/Part";

type DatabaseStatus = "ENVIADO" | "RECUSADO" | "EM_ANDAMENTO" | "APROVADO" | "PAGO";

const toDatabaseStatus: Record<BudgetStatus, DatabaseStatus> = {
  Enviado: "ENVIADO",
  Recusado: "RECUSADO",
  "Em andamento": "EM_ANDAMENTO",
  Aprovado: "APROVADO",
  Pago: "PAGO",
};

const fromDatabaseStatus: Record<DatabaseStatus, BudgetStatus> = {
  ENVIADO: "Enviado",
  RECUSADO: "Recusado",
  EM_ANDAMENTO: "Em andamento",
  APROVADO: "Aprovado",
  PAGO: "Pago",
};

const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => Number(value || 0);

function mapClient(row: Record<string, unknown>): Client {
  return {
    id: text(row.id), name: text(row.name), document: text(row.document),
    phone: text(row.phone), email: text(row.email), contact: text(row.contact),
    address: text(row.address), city: text(row.city), state: text(row.state), cep: text(row.cep),
  };
}

function mapService(row: Record<string, unknown>): Service {
  return {
    id: text(row.id), code: text(row.code), description: text(row.description),
    unit: text(row.unit), unitPrice: number(row.unit_price),
  };
}

function mapAppSettings(row: Record<string, unknown> | null): AppSettings {
  if (!row) return { ...DEFAULT_APP_SETTINGS };
  return {
    companyName: text(row.company_name) || DEFAULT_APP_SETTINGS.companyName,
    appName: text(row.app_name) || DEFAULT_APP_SETTINGS.appName,
    segment: text(row.segment) || DEFAULT_APP_SETTINGS.segment,
    document: text(row.document), phone: text(row.phone), email: text(row.email),
    address: text(row.address), logoDataUrl: text(row.logo_data_url),
  };
}

function mapPart(row: Record<string, unknown>): Part {
  return {
    id: text(row.id), code: text(row.code), description: text(row.description),
    stockQuantity: number(row.stock_quantity), unitPrice: number(row.unit_price),
  };
}

function assertNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function loadDatabase() {
  const [clientsResult, servicesResult, budgetsResult, settingsResult, partsResult] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
    supabase.from("services").select("*").order("created_at", { ascending: false }),
    supabase.from("budgets").select("*, clients(*), budget_items(*)").order("updated_at", { ascending: false }),
    supabase.from("app_settings").select("*").eq("id", "main").maybeSingle(),
    supabase.from("parts").select("*").order("created_at", { ascending: false }),
  ]);
  assertNoError(clientsResult.error); assertNoError(servicesResult.error); assertNoError(budgetsResult.error);

  const clients = (clientsResult.data || []).map((row) => mapClient(row as Record<string, unknown>));
  const services = (servicesResult.data || []).map((row) => mapService(row as Record<string, unknown>));
  const budgets: Budget[] = (budgetsResult.data || []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const clientRow = row.clients as Record<string, unknown> | null;
    const items = (row.budget_items as Record<string, unknown>[] | null) || [];
    return {
      id: text(row.id), number: text(row.number), issuedAt: text(row.issued_at),
      validDays: number(row.valid_days),
      status: fromDatabaseStatus[row.status as DatabaseStatus],
      technicianName: text(row.technician_name),
      client: clientRow ? mapClient(clientRow) : { id: "", name: "", document: "", phone: "", email: "", contact: "", address: "", city: "", state: "CE", cep: "" },
      payment: text(row.payment), notes: text(row.notes), updatedAt: text(row.updated_at),
      pdfSavedAt: row.pdf_url ? text(row.updated_at) : undefined,
      pdfUrl: row.pdf_url ? text(row.pdf_url) : undefined,
      createdBy: row.created_by ? text(row.created_by) : undefined,
      stockDeductedAt: row.stock_deducted_at ? text(row.stock_deducted_at) : undefined,
      items: items.map((item) => ({
        id: text(item.id), serviceId: text(item.service_id), partId: text(item.part_id), serviceCode: text(item.service_code),
        description: text(item.description), quantity: number(item.quantity),
        unit: text(item.unit), unitPrice: number(item.unit_price),
      })),
    };
  });
  const settings = settingsResult.error ? { ...DEFAULT_APP_SETTINGS } : mapAppSettings(settingsResult.data as Record<string, unknown> | null);
  const parts = partsResult.error ? [] : (partsResult.data || []).map((row) => mapPart(row as Record<string, unknown>));
  return { clients, services, budgets, settings, parts };
}

export async function saveAppSettingsToDatabase(settings: AppSettings) {
  const { data, error } = await supabase.from("app_settings").upsert({
    id: "main", company_name: settings.companyName, app_name: settings.appName,
    segment: settings.segment, document: settings.document || null,
    phone: settings.phone || null, email: settings.email || null,
    address: settings.address || null, logo_data_url: settings.logoDataUrl || null,
    updated_at: new Date().toISOString(),
  }).select().single();
  assertNoError(error);
  return mapAppSettings(data as Record<string, unknown>);
}

export async function savePartToDatabase(part: Part) {
  const { data, error } = await supabase.from("parts").upsert({
    id: part.id, code: part.code, description: part.description,
    stock_quantity: part.stockQuantity, unit_price: part.unitPrice,
    updated_at: new Date().toISOString(),
  }).select().single();
  assertNoError(error);
  return mapPart(data as Record<string, unknown>);
}

export async function deletePartFromDatabase(id: string) {
  const { error } = await supabase.from("parts").delete().eq("id", id);
  assertNoError(error);
}

export async function loadPartsFromDatabase() {
  const { data, error } = await supabase.from("parts").select("*").order("created_at", { ascending: false });
  assertNoError(error);
  return (data || []).map((row) => mapPart(row as Record<string, unknown>));
}

export async function approveBudgetAndDeductStock(budget: Budget) {
  await saveBudgetToDatabase({ ...budget, status: "Em andamento" });
  const { data, error } = await supabase.rpc("approve_budget_and_deduct_stock", { target_budget_id: budget.id });
  assertNoError(error);
  return { ...budget, status: "Aprovado" as const, stockDeductedAt: text(data), updatedAt: new Date().toISOString() };
}

export async function saveClientToDatabase(client: Client) {
  const { data, error } = await supabase.from("clients").upsert({
    id: client.id, name: client.name, document: client.document || null,
    phone: client.phone || null, email: client.email || null, contact: client.contact || null,
    address: client.address || null, city: client.city || null, state: client.state || null,
    cep: client.cep || null, updated_at: new Date().toISOString(),
  }).select().single();
  assertNoError(error); return mapClient(data as Record<string, unknown>);
}

export async function saveServiceToDatabase(service: Service) {
  const { data, error } = await supabase.from("services").upsert({
    id: service.id, code: service.code, description: service.description,
    unit: "un.", unit_price: service.unitPrice, updated_at: new Date().toISOString(),
  }).select().single();
  assertNoError(error); return mapService(data as Record<string, unknown>);
}

export async function deleteServiceFromDatabase(id: string) {
  const { error } = await supabase.from("services").delete().eq("id", id);
  assertNoError(error);
}

export async function saveBudgetToDatabase(budget: Budget) {
  const updatedAt = new Date().toISOString();
  let client = budget.client;
  if (!client.id && client.name.trim()) {
    client = await saveClientToDatabase({ ...client, id: crypto.randomUUID() });
  }
  const { error: budgetError } = await supabase.from("budgets").upsert({
    id: budget.id, number: budget.number, client_id: client.id || null,
    issued_at: budget.issuedAt, valid_days: budget.validDays,
    technician_name: budget.technicianName.trim() || null,
    status: toDatabaseStatus[budget.status], payment: budget.payment || null,
    notes: budget.notes || null, pdf_url: budget.pdfUrl || null, updated_at: updatedAt,
  });
  assertNoError(budgetError);

  const { error: deleteError } = await supabase.from("budget_items").delete().eq("budget_id", budget.id);
  assertNoError(deleteError);
  if (budget.items.length) {
    const { error: itemsError } = await supabase.from("budget_items").insert(budget.items.map((item) => ({
      id: item.id, budget_id: budget.id, service_id: item.serviceId || null, part_id: item.partId || null,
      service_code: item.serviceCode || null, description: item.description || "Item ou serviço",
      quantity: item.quantity, unit: item.unit, unit_price: item.unitPrice,
    })));
    assertNoError(itemsError);
  }
  return { ...budget, client, updatedAt };
}

export async function loadNextBudgetNumber() {
  const { data, error } = await supabase.rpc("get_next_budget_number");
  assertNoError(error);
  return text(data) || "ORC-01";
}

export async function deleteBudgetFromDatabase(id: string) {
  const { error } = await supabase.from("budgets").delete().eq("id", id);
  assertNoError(error);
}
