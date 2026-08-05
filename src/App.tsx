import { BudgetApplication } from "./modules/budgets/components/BudgetApplication";
import { AuthGate } from "./modules/auth/components/AuthGate";
import { AppNotifications } from "./modules/shared/components/AppNotifications";
import { PdfLayoutTest } from "./modules/pdf/components/PdfLayoutTest";

export default function App() {
  if (new URLSearchParams(window.location.search).get("test") === "pdf") {
    return <PdfLayoutTest />;
  }
  return (
    <>
      <AppNotifications />
      <AuthGate>
        <BudgetApplication />
      </AuthGate>
    </>
  );
}
