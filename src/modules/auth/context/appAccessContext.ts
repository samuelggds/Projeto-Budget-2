import { createContext, useContext } from "react";
import type { AppRole, AppSubscription } from "../../billing/types/Billing";

interface AppAccess {
  role: AppRole;
  subscription: AppSubscription;
}

export const AppAccessContext = createContext<AppAccess | null>(null);

export function useAppRole() {
  const ctx = useContext(AppAccessContext);
  if (!ctx) throw new Error("Função da conta não carregada");
  return ctx.role;
}

export function useSubscription() {
  const ctx = useContext(AppAccessContext);
  if (!ctx) throw new Error("Função da conta não carregada");
  return ctx.subscription;
}
