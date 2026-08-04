export const ALERT_THRESHOLD_DAYS = 3;

export function daysUntilPayment(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T00:00:00`);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

export function isPaymentAlert(nextPaymentDate: string | undefined): boolean {
  if (!nextPaymentDate) return false;
  return daysUntilPayment(nextPaymentDate) <= ALERT_THRESHOLD_DAYS;
}
