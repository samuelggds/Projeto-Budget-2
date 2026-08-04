import { describe, expect, it } from "vitest";
import { BUDGET_STATUSES, canChangeBudgetStatus, getAllowedNextStatuses, isFinalBudgetStatus } from "./budgetStatus";

describe("fluxo de status do orçamento", () => {
  it("mantém todos os status na ordem definida", () => {
    expect(BUDGET_STATUSES).toEqual(["Enviado", "Recusado", "Em andamento", "Aprovado", "Pago"]);
  });

  it("permite apenas os avanços previstos", () => {
    expect(getAllowedNextStatuses("Enviado")).toEqual(["Em andamento", "Recusado"]);
    expect(getAllowedNextStatuses("Em andamento")).toEqual(["Aprovado", "Recusado"]);
    expect(getAllowedNextStatuses("Aprovado")).toEqual(["Pago"]);
  });

  it("não permite voltar o status", () => {
    expect(canChangeBudgetStatus("Aprovado", "Em andamento")).toBe(false);
    expect(canChangeBudgetStatus("Pago", "Aprovado")).toBe(false);
  });

  it("encerra o fluxo em Pago ou Recusado", () => {
    expect(isFinalBudgetStatus("Pago")).toBe(true);
    expect(isFinalBudgetStatus("Recusado")).toBe(true);
    expect(getAllowedNextStatuses("Pago")).toEqual([]);
    expect(getAllowedNextStatuses("Recusado")).toEqual([]);
  });
});
