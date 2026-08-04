export interface DiscountPreset {
  id: string;
  name: string;
  type: "percentage" | "fixed";
  value: number;
}
