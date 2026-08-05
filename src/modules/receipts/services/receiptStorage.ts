import type { Receipt } from "../types/Receipt";

const KEY = "mg-recibos";

export function loadReceipts(): Receipt[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Receipt[]) : [];
  } catch {
    return [];
  }
}

export function saveReceipts(receipts: Receipt[]): void {
  localStorage.setItem(KEY, JSON.stringify(receipts));
}

export function nextReceiptNumber(receipts: Receipt[]): string {
  const nums = receipts
    .map((r) => parseInt(r.number.replace(/\D/g, ""), 10))
    .filter(Number.isFinite);
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return String(max + 1).padStart(3, "0");
}
