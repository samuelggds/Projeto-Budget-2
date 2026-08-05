import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  daysUntilPayment,
  isPaymentAlert,
  nextBiweeklyCycle,
} from "./paymentAlerts";

const TODAY = "2026-08-04";

function toIso(date: string) {
  return new Date(`${date}T00:00:00`).getTime();
}
function d(iso: string) {
  return new Date(`${iso}T00:00:00`);
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

// ─── Ciclo quinzenal ────────────────────────────────────────────────────────
// Primeiro pagamento: 2026-08-05
// Ciclo esperado:     2026-08-05 → 2026-08-20 → 2026-09-04 → 2026-09-19 ...

describe("nextBiweeklyCycle — ciclo de 15 dias", () => {
  it("pagamento no prazo: próximo vencimento é +15 dias", () => {
    // Admin confirmou no dia do vencimento (2026-08-05)
    expect(nextBiweeklyCycle("2026-08-05", d("2026-08-05"))).toBe("2026-08-20");
  });

  it("pagamento com 5 dias de atraso: próximo ainda é +15 do vencimento original", () => {
    // Venceu 2026-08-05, admin só confirmou em 2026-08-10
    // Próximo deve ser 2026-08-20, NÃO 2026-08-25
    expect(nextBiweeklyCycle("2026-08-05", d("2026-08-10"))).toBe("2026-08-20");
  });

  it("pagamento com 30 dias de atraso: pula ciclos passados", () => {
    // Venceu 2026-08-05, admin só confirmou em 2026-09-04
    // 2026-08-05+15 = 20/08 → já passou
    // 2026-08-20+15 = 04/09 → já passou (mesmo dia, mas ≤ hoje)
    // 2026-09-04+15 = 19/09 → futuro!
    expect(nextBiweeklyCycle("2026-08-05", d("2026-09-04"))).toBe("2026-09-19");
  });

  it("admin nunca pagou: ciclo continua independente — próximo sempre é futuro", () => {
    // Mesmo sem clicar pagar, a data avançaria corretamente
    expect(nextBiweeklyCycle("2026-08-20", d("2026-09-01"))).toBe("2026-09-04");
    expect(nextBiweeklyCycle("2026-08-20", d("2026-09-19"))).toBe("2026-10-04");
  });

  it("alerta de vencimento aparece 3 dias antes do próximo ciclo", () => {
    // Próximo vencimento: 2026-08-20
    // Em 2026-08-17 (3 dias antes) deve disparar alerta
    vi.useFakeTimers();
    vi.setSystemTime(toIso("2026-08-17"));
    expect(isPaymentAlert("2026-08-20")).toBe(true);
    vi.useRealTimers();
  });

  it("alerta NÃO aparece 4 dias antes do vencimento", () => {
    vi.useFakeTimers();
    vi.setSystemTime(toIso("2026-08-16"));
    expect(isPaymentAlert("2026-08-20")).toBe(false);
    vi.useRealTimers();
  });

  it("alerta de atraso aparece quando venceu e admin não pagou", () => {
    vi.useFakeTimers();
    vi.setSystemTime(toIso("2026-08-21")); // 1 dia depois do vencimento 20/08
    expect(isPaymentAlert("2026-08-20")).toBe(true);
    expect(daysUntilPayment("2026-08-20")).toBe(-1);
    vi.useRealTimers();
  });

  it("alerta some após confirmar pagamento (next_payment_date avança para futuro)", () => {
    // Admin confirma no dia 2026-08-22 (2 dias atrasado)
    // Próximo vencimento calculado: 2026-09-04
    const next = nextBiweeklyCycle("2026-08-20", d("2026-08-22"));
    expect(next).toBe("2026-09-04");

    // No dia 2026-08-22 o novo vencimento 04/09 está a 13 dias → sem alerta
    vi.useFakeTimers();
    vi.setSystemTime(toIso("2026-08-22"));
    expect(isPaymentAlert(next)).toBe(false);
    vi.useRealTimers();
  });

  it("ciclo completo: 4 vencimentos consecutivos partindo de 2026-08-05", () => {
    // Simula 4 ciclos pagos sempre no dia do vencimento
    const dates = ["2026-08-05"];
    for (let i = 0; i < 3; i++) {
      const last = dates[dates.length - 1];
      dates.push(nextBiweeklyCycle(last, d(last)));
    }
    expect(dates).toEqual([
      "2026-08-05",
      "2026-08-20",
      "2026-09-04",
      "2026-09-19",
    ]);
  });
});
