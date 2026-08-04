import { describe, expect, it } from "vitest";
import type { Budget, BudgetItem } from "../types/Budget";
import {
  calculateBudgetTotal,
  calculateItemTotal,
  formatMoney,
} from "./budgetCalculations";

const item = (quantity: number, unitPrice: number): BudgetItem => ({
  id: crypto.randomUUID(),
  description: "Serviço",
  quantity,
  unit: "un.",
  unitPrice,
});

const budgetWith = (items: BudgetItem[]): Budget => ({
  id: crypto.randomUUID(),
  number: "ORC-01",
  issuedAt: "2026-08-01",
  validDays: 5,
  status: "Enviado",
  client: {
    name: "Cliente",
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
  items,
  technicianName: "",
  updatedAt: "2026-08-01T12:00:00.000Z",
  createdAt: "2026-08-01T12:00:00.000Z",
});

describe("cálculos do orçamento", () => {
  it("calcula o total de um item pela quantidade e valor unitário", () => {
    expect(calculateItemTotal(item(3, 125.5))).toBe(376.5);
  });

  it("soma serviços e peças do orçamento", () => {
    expect(calculateBudgetTotal(budgetWith([item(2, 100), item(3, 50)]))).toBe(
      350,
    );
  });

  it("retorna zero para orçamento sem itens", () => {
    expect(calculateBudgetTotal(budgetWith([]))).toBe(0);
  });

  it("formata valores em reais", () => {
    expect(formatMoney(1250.5)).toContain("1.250,50");
    expect(formatMoney(0)).toContain("0,00");
  });
});
