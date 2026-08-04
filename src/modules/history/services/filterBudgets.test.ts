import { afterEach, describe, expect, it, vi } from "vitest";
import type { Budget, BudgetStatus } from "../../budgets/types/Budget";
import {
  filterBudgets,
  HISTORY_PAGE_SIZE,
  paginateBudgets,
} from "./filterBudgets";

const budget = (
  number: string,
  name: string,
  status: BudgetStatus,
  issuedAt: string,
  updatedAt = `${issuedAt}T12:00:00.000Z`,
): Budget => ({
  id: number,
  number,
  issuedAt,
  validDays: 5,
  status,
  client: {
    name,
    document: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "CE",
    cep: "",
    contact: "",
  },
  payment: "PIX",
  notes: "",
  items: [],
  technicianName: "",
  updatedAt,
});

afterEach(() => vi.useRealTimers());

describe("filtros e paginação do histórico", () => {
  const budgets = [
    budget("ORC-01", "Ana", "Pago", "2026-08-01", "2026-08-01T12:00:00.000Z"),
    budget(
      "ORC-02",
      "Bruno",
      "Enviado",
      "2026-07-01",
      "2026-07-01T12:00:00.000Z",
    ),
    budget(
      "ORC-03",
      "Carlos",
      "Pago",
      "2026-08-02",
      "2026-08-02T12:00:00.000Z",
    ),
  ];

  it("busca pelo cliente ou número sem diferenciar maiúsculas", () => {
    expect(
      filterBudgets(budgets, {
        search: "ana",
        status: "Todos",
        period: "Todos",
      }).map((item) => item.number),
    ).toEqual(["ORC-01"]);
    expect(
      filterBudgets(budgets, {
        search: "orc-03",
        status: "Todos",
        period: "Todos",
      }).map((item) => item.client.name),
    ).toEqual(["Carlos"]);
  });

  it("filtra pelo status e ordena pelo registro mais atualizado", () => {
    expect(
      filterBudgets(budgets, {
        search: "",
        status: "Pago",
        period: "Todos",
      }).map((item) => item.number),
    ).toEqual(["ORC-03", "ORC-01"]);
  });

  it("filtra pelo período informado", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
    expect(
      filterBudgets(budgets, { search: "", status: "Todos", period: "7" }).map(
        (item) => item.number,
      ),
    ).toEqual(["ORC-03", "ORC-01"]);
  });

  it("divide o histórico no tamanho padrão", () => {
    const many = Array.from({ length: HISTORY_PAGE_SIZE + 2 }, (_, index) =>
      budget(`ORC-${index + 1}`, `Cliente ${index}`, "Enviado", "2026-08-01"),
    );
    expect(paginateBudgets(many, 1)).toHaveLength(HISTORY_PAGE_SIZE);
    expect(paginateBudgets(many, 2)).toHaveLength(2);
  });
});
