import { ReactNode, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isAuthConfigured, supabase } from "../services/supabase";
import { LoginPage } from "./LoginPage";
import { BillingPanel, SubscriptionBlocked } from "../../billing/components/BillingPanel";
import { loadBilling, loadCurrentRole, subscriptionAllowsAccess } from "../../billing/services/billingApi";
import type { AppRole, AppSubscription } from "../../billing/types/Billing";

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [subscription, setSubscription] = useState<AppSubscription | null>(null);
  const [accessError, setAccessError] = useState("");

  useEffect(() => {
    const acceptUser = async (candidate: User | null) => {
      setUser(candidate);
      if (!candidate) { setRole(null); setSubscription(null); setLoading(false); return; }
      try {
        const currentRole = await loadCurrentRole();
        const billing = await loadBilling();
        setRole(currentRole); setSubscription(billing.subscription); setAccessError("");
      } catch (error) { setAccessError((error as Error).message); }
      finally { setLoading(false); }
    };

    if (!isAuthConfigured) { setLoading(false); return; }
    supabase.auth.getUser().then(({ data }) => acceptUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { void acceptUser(session?.user ?? null); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="auth-loading"><img src="/logo-placeholder.svg" alt="Logo" /><span>Verificando acesso...</span></div>;
  if (!user) return <LoginPage />;
  if (accessError || !role || !subscription) return <main className="database-error-page"><section className="login-card"><div className="login-error">{accessError || "Conta sem permissão configurada"}</div><button className="button primary" onClick={() => void supabase.auth.signOut({ scope: "local" })}>Sair</button></section></main>;
  if (role === "BILLING_ADMIN") return <BillingPanel />;
  return subscriptionAllowsAccess(subscription) ? children : <SubscriptionBlocked subscription={subscription} />;
}
