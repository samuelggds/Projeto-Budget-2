import { createContext, useContext } from "react";
import type { AppRole } from "../../billing/types/Billing";

export const AppAccessContext = createContext<AppRole | null>(null);

export function useAppRole() {
  const role = useContext(AppAccessContext);
  if (!role) throw new Error("Função da conta não carregada");
  return role;
}
