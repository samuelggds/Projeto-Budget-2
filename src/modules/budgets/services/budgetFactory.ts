import type { Budget } from "../types/Budget";

export const emptyClient = {
  id: "",
  name: "",
  document: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "CE",
  cep: "",
  contact: "",
};

export function createInitialBudget(): Budget {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    number: "ORC-01",
    issuedAt: now.slice(0, 10),
    validDays: 5,
    status: "Enviado",
    technicianName: "",
    client: { ...emptyClient },
    payment: "PIX",
    notes: "",
    items: [
      {
        id: crypto.randomUUID(),
        serviceId: "",
        serviceCode: "",
        description: "",
        quantity: 1,
        unit: "un.",
        unitPrice: 0,
      },
    ],
    createdAt: "",
    updatedAt: now,
  };
}

export function createNextBudget(saved: Budget[]): Budget {
  const highest = Math.max(
    0,
    ...saved.map((budget) => {
      const match = budget.number.match(/^ORC-(\d+)$/i);
      return match ? Math.max(0, Number.parseInt(match[1], 10)) : 0;
    }),
  );
  const nextNumber = Math.max(1, highest + 1);

  return {
    ...createInitialBudget(),
    number: `ORC-${String(nextNumber).padStart(2, "0")}`,
  };
}
