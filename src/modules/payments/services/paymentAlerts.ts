export const ALERT_THRESHOLD_DAYS = 3;

export function daysUntilPayment(date: string, ref?: Date): number {
  const today = ref ? new Date(ref) : new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T00:00:00`);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

export function isPaymentAlert(nextPaymentDate: string | undefined): boolean {
  if (!nextPaymentDate) return false;
  return daysUntilPayment(nextPaymentDate) <= ALERT_THRESHOLD_DAYS;
}

/** Mirrors the SQL mark_payee_payment_paid logic for employees (15-day cycle). */
export function nextBiweeklyCycle(currentDue: string, today: Date): string {
  const addDays = (iso: string, n: number) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);
  let next = addDays(currentDue, 15);
  while (new Date(`${next}T00:00:00`) <= todayMidnight) {
    next = addDays(next, 15);
  }
  return next;
}
