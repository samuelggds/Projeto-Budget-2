export type AppSettings = {
  companyName: string;
  appName: string;
  segment: string;
  document: string;
  phone: string;
  email: string;
  address: string;
  logoDataUrl: string;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  companyName: "MG Refrigeração",
  appName: "MG Orçamentos",
  segment: "Refrigeração",
  document: "31.263.081/0001-46",
  phone: "(85) 98932-3113",
  email: "matheuslegend10@icloud.com",
  address: "Rua Francisco Calaça, 1688 — Fortaleza/CE — CEP 60.336-232",
  logoDataUrl: "",
};
