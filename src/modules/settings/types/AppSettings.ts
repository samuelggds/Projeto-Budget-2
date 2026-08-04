import type { DiscountPreset } from "../../budgets/types/DiscountPreset";

export type AppSettings = {
  companyName: string;
  appName: string;
  segment: string;
  document: string;
  phone: string;
  phone2: string;
  phone3: string;
  phone4: string;
  email: string;
  address: string;
  logoDataUrl: string;
  pdfBackgroundUrl: string;
  discounts: DiscountPreset[];
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  companyName: "Sua empresa",
  appName: "Orçamentos",
  segment: "Gestão de propostas",
  document: "",
  phone: "",
  phone2: "",
  phone3: "",
  phone4: "",
  email: "",
  address: "",
  logoDataUrl: "",
  pdfBackgroundUrl: "",
  discounts: [],
};
