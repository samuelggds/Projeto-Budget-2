export interface Supplier {
  id: string;
  name: string;
  document: string;
  phone: string;
  paymentMethod: string;
  pixKey: string;
  paymentDate: string;
  paymentAmount: number;
  nextPaymentDate: string;
  lastPaidAt?: string;
  createdAt?: string;
  updatedAt?: string;
}
