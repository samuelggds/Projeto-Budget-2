import type { ReactNode } from "react";
import type { AppRole } from "../../billing/types/Billing";
import { AppAccessContext } from "./appAccessContext";

export function AppAccessProvider({ role, children }: { role: AppRole; children: ReactNode }) {
  return <AppAccessContext.Provider value={role}>{children}</AppAccessContext.Provider>;
}
