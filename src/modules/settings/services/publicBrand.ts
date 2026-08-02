import { useEffect, useState } from "react";
import { supabase } from "../../auth/services/supabase";

export type PublicBrand = {
  companyName: string;
  appName: string;
  segment: string;
  logoDataUrl: string;
};

export const DEFAULT_PUBLIC_BRAND: PublicBrand = {
  companyName: "Sua empresa",
  appName: "Orçamentos",
  segment: "Gestão de propostas",
  logoDataUrl: "",
};

export function usePublicBrand() {
  const [brand, setBrand] = useState(DEFAULT_PUBLIC_BRAND);

  useEffect(() => {
    supabase.rpc("get_public_brand").single().then(({ data }) => {
      if (!data) return;
      const row = data as Record<string, unknown>;
      setBrand({
        companyName: String(row.company_name || DEFAULT_PUBLIC_BRAND.companyName),
        appName: String(row.app_name || DEFAULT_PUBLIC_BRAND.appName),
        segment: String(row.segment || DEFAULT_PUBLIC_BRAND.segment),
        logoDataUrl: String(row.logo_data_url || ""),
      });
    });
  }, []);

  return brand;
}
