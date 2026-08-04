import { BudgetApplication } from "./modules/budgets/components/BudgetApplication";
import { AuthGate } from "./modules/auth/components/AuthGate";
import { AppNotifications } from "./modules/shared/components/AppNotifications";

export default function App() {
  return (
    <>
      <AppNotifications />
      <AuthGate>
        <BudgetApplication />
      </AuthGate>
    </>
  );
}
