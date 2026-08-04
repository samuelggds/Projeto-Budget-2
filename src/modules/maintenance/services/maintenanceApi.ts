import { supabase } from "../../auth/services/supabase";
import type { MaintenancePlan } from "../types/MaintenancePlan";

function assertNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function mapPlan(row: Record<string, unknown>): MaintenancePlan {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id: text(row.id),
    companyName: text(row.company_name),
    vehiclePlate: text(row.vehicle_plate),
    brand: text(row.brand),
    model: text(row.model),
    firstMaintenanceDate: text(row.first_maintenance_date),
    nextMaintenanceDate: text(row.next_maintenance_date),
    notes: text(row.notes),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export async function loadMaintenancePlans(): Promise<MaintenancePlan[]> {
  const { data, error } = await supabase
    .from("maintenance_plans")
    .select("*")
    .order("next_maintenance_date", { ascending: true });
  assertNoError(error);
  return (data || []).map((row) => mapPlan(row as Record<string, unknown>));
}

export async function saveMaintenancePlan(
  plan: MaintenancePlan,
): Promise<MaintenancePlan> {
  const { data, error } = await supabase
    .from("maintenance_plans")
    .upsert({
      id: plan.id,
      company_name: plan.companyName.trim(),
      vehicle_plate: plan.vehiclePlate.trim().toUpperCase(),
      brand: plan.brand.trim(),
      model: plan.model.trim(),
      first_maintenance_date: plan.firstMaintenanceDate,
      next_maintenance_date: plan.nextMaintenanceDate,
      notes: plan.notes.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  assertNoError(error);
  return mapPlan(data as Record<string, unknown>);
}

export async function deleteMaintenancePlan(id: string): Promise<void> {
  const { error } = await supabase
    .from("maintenance_plans")
    .delete()
    .eq("id", id);
  assertNoError(error);
}
