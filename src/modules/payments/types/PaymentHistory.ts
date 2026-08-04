export type PayeeType = "SUPPLIER" | "EMPLOYEE";

export interface PaymentHistory {
  id: string;
  payeeType: PayeeType;
  payeeId: string;
  payeeName: string;
  amount: number;
  dueDate: string;
  paidAt: string;
}
