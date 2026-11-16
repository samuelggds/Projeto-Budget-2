import type { Receipt } from "../types/Receipt";

const KEY = "mg-recibos";
const MIGRATED_KEY = "mg-recibos-migrated-ids";

export function loadReceipts(): Receipt[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((r): r is Receipt =>
          r !== null && typeof r === "object" &&
          typeof r.id === "string" && typeof r.number === "string")
      : [];
  } catch {
    return [];
  }
}

// Compatibilidade com instalacoes antigas. Novos recibos vao ao Supabase.
export function saveReceipts(receipts: Receipt[]): void {
  localStorage.setItem(KEY, JSON.stringify(receipts));
}

export function migratedReceiptIds(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(MIGRATED_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function markReceiptMigrated(id: string): void {
  if (!id) return;
  const ids = migratedReceiptIds();
  ids.add(id);
  localStorage.setItem(MIGRATED_KEY, JSON.stringify([...ids]));
}

export function nextReceiptNumber(receipts: Receipt[]): string {
  const nums = receipts
    .map((r) => parseInt(r.number.replace(/\D/g, ""), 10))
    .filter(Number.isFinite);
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return String(max + 1).padStart(3, "0");
}
