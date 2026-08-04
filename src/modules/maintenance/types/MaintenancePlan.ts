export interface MaintenancePlan {
  id: string;
  companyName: string;
  vehiclePlate: string;
  brand: string;
  model: string;
  firstMaintenanceDate: string;
  nextMaintenanceDate: string;
  notes: string;
  status?: "pendente" | "concluida" | "cancelada";
  createdAt?: string;
  updatedAt?: string;
}
