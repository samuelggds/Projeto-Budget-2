import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { daysUntilPayment, isPaymentAlert } from "./paymentAlerts";

const TODAY = "2026-08-04";

function toIso(date: string) {
  return new Date(`${date}T00:00:00`).getTime();
}

describe("daysUntilPayment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(toIso(TODAY));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retorna 0 quando o vencimento é hoje", () => {
    expect(daysUntilPayment("2026-08-04")).toBe(0);
  });

  it("retorna valor positivo para vencimento futuro", () => {
    expect(daysUntilPayment("2026-08-07")).toBe(3);
    expect(daysUntilPayment("2026-08-05")).toBe(1);
  });

  it("retorna valor negativo para pagamento em atraso", () => {
    expect(daysUntilPayment("2026-08-03")).toBe(-1);
    expect(daysUntilPayment("2026-07-01")).toBe(-34);
  });
});

describe("isPaymentAlert", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(toIso(TODAY));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispara alerta para pagamento vencendo hoje", () => {
    expect(isPaymentAlert("2026-08-04")).toBe(true);
  });

  it("dispara alerta para pagamento vencendo em 1 dia", () => {
    expect(isPaymentAlert("2026-08-05")).toBe(true);
  });

  it("dispara alerta para pagamento vencendo em exatamente 3 dias", () => {
    expect(isPaymentAlert("2026-08-07")).toBe(true);
  });

  it("não dispara alerta para pagamento vencendo em 4 dias ou mais", () => {
    expect(isPaymentAlert("2026-08-08")).toBe(false);
    expect(isPaymentAlert("2026-12-31")).toBe(false);
  });

  it("dispara alerta para pagamento em atraso", () => {
    expect(isPaymentAlert("2026-08-01")).toBe(true);
    expect(isPaymentAlert("2026-01-01")).toBe(true);
  });

  it("não dispara alerta se a data não for informada", () => {
    expect(isPaymentAlert(undefined)).toBe(false);
    expect(isPaymentAlert("")).toBe(false);
  });
});
