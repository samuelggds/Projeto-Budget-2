export type Part = {
  id: string;
  code: string;
  description: string;
  stockQuantity: number;
  unit: "m" | "un" | "kg";
  unitPrice: number;
};
