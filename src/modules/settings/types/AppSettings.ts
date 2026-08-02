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
  companyName: "Sua empresa",
  appName: "Orçamentos",
  segment: "Gestão de propostas",
  document: "",
  phone: "",
  email: "",
  address: "",
  logoDataUrl: "",
};
