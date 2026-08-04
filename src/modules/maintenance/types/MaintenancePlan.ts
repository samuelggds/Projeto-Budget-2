export interface MaintenancePlan {
  id: string;
  companyName: string;
  vehiclePlate: string;
  brand: string;
  model: string;
  firstMaintenanceDate: string;
  nextMaintenanceDate: string;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}
