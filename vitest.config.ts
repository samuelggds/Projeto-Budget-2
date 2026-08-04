import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/modules/budgets/services/budgetCalculations.ts",
        "src/modules/budgets/services/budgetFactory.ts",
        "src/modules/budgets/services/budgetStatus.ts",
        "src/modules/history/services/filterBudgets.ts",
      ],
      thresholds: { statements: 90, branches: 80, functions: 90, lines: 90 },
    },
  },
});
