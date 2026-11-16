import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "../types/Receipt";
import {
  loadReceipts,
  markReceiptMigrated,
  migratedReceiptIds,
  nextReceiptNumber,
} from "./receiptStorage";

const receipt = (id: string, number: string): Receipt => ({
  id,
  number,
  amount: 100,
  receivedFrom: "Cliente",
  amountDescription: "cem reais",
  referringTo: "Serviço",
  city: "Fortaleza",
  date: "2026-11-01",
  signerName: "Empresa",
  signerDocument: "",
  createdAt: "2026-11-01T12:00:00Z",
});

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  });
});

describe("recuperação de recibos do armazenamento antigo", () => {
  it("recupera todos os recibos existentes sem remover dados", () => {
    localStorage.setItem("mg-recibos", JSON.stringify([receipt("a", "001"), receipt("b", "002")]));
    expect(loadReceipts()).toHaveLength(2);
    expect(loadReceipts()[0].receivedFrom).toBe("Cliente");
    expect(localStorage.getItem("mg-recibos")).toContain('"id":"a"');
  });

  it("não quebra quando a cópia local está corrompida", () => {
    localStorage.setItem("mg-recibos", "{invalid");
    expect(loadReceipts()).toEqual([]);
  });

  it("marca importações por ID sem afetar cópias locais", () => {
    localStorage.setItem("mg-recibos", JSON.stringify([receipt("a", "001")]));
    markReceiptMigrated("a");
    markReceiptMigrated("a");
    expect([...migratedReceiptIds()]).toEqual(["a"]);
    expect(loadReceipts()).toHaveLength(1);
  });

  it("calcula a próxima numeração preservando recibos antigos", () => {
    expect(nextReceiptNumber([receipt("a", "001"), receipt("b", "011")])).toBe("012");
  });
});
