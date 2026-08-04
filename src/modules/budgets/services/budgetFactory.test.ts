import { afterEach, describe, expect, it, vi } from "vitest";
import type { Budget } from "../types/Budget";
import { createInitialBudget, createNextBudget } from "./budgetFactory";

const savedBudget = (number: string): Budget => ({
  ...createInitialBudget(), number,
});

afterEach(() => vi.useRealTimers());

describe("criação e numeração de orçamentos", () => {
  it("cria o primeiro orçamento com valores padrão", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
    const budget = createInitialBudget();
    expect(budget.number).toBe("ORC-01");
    expect(budget.status).toBe("Enviado");
    expect(budget.payment).toBe("PIX");
    expect(budget.items[0].unit).toBe("un.");
    expect(budget.issuedAt).toBe("2026-08-03");
  });

  it("incrementa o maior número existente sem gerar negativos", () => {
    expect(createNextBudget([savedBudget("ORC-02"), savedBudget("ORC-09")]).number).toBe("ORC-10");
    expect(createNextBudget([savedBudget("ORC--5"), savedBudget("inválido")]).number).toBe("ORC-01");
  });

  it("mantém zeros à esquerda na sequência", () => {
    expect(createNextBudget([savedBudget("ORC-01")]).number).toBe("ORC-02");
  });
});
