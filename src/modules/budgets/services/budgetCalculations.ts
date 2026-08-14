import type { Budget, BudgetItem } from "../types/Budget";

export function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

export const calculateItemTotal = (item: BudgetItem) =>
  item.quantity * item.unitPrice;

export const calculateBudgetTotal = (budget: Budget) =>
  budget.items.reduce((total, item) => total + calculateItemTotal(item), 0);

export const calculateDiscountTotal = (budget: Budget): number => {
  const subtotal = calculateBudgetTotal(budget);
  if (!budget.discounts?.length) return budget.discountAmount || 0;

  const discountTotal = budget.discounts.reduce(
    (total, discount) =>
      total +
      (discount.type === "percentage"
        ? (subtotal * discount.value) / 100
        : discount.value),
    0,
  );
  return Math.min(subtotal, discountTotal);
};

export const calculateFinalTotal = (budget: Budget): number =>
  Math.max(0, calculateBudgetTotal(budget) - calculateDiscountTotal(budget));
