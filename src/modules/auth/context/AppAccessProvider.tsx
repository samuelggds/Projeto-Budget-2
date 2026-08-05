import type { ReactNode } from "react";
import type { AppRole, AppSubscription } from "../../billing/types/Billing";
import { AppAccessContext } from "./appAccessContext";

interface Props {
  role: AppRole;
  subscription: AppSubscription;
  children: ReactNode;
}

export function AppAccessProvider({ role, subscription, children }: Props) {
  return (
    <AppAccessContext.Provider value={{ role, subscription }}>
      {children}
    </AppAccessContext.Provider>
  );
}
