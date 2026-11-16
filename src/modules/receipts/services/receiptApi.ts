import { supabase } from "../../auth/services/supabase";
import type { Receipt } from "../types/Receipt";

type ReceiptRow = {
  id: string;
  receipt_number: number;
  amount: number;
  received_from: string;
  amount_description: string;
  referring_to: string;
  city: string;
  receipt_date: string;
  signer_name: string;
  signer_document: string;
  created_at: string;
};

export function mapReceiptRow(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    number: String(row.receipt_number).padStart(3, "0"),
    amount: Number(row.amount),
    receivedFrom: row.received_from,
    amountDescription: row.amount_description,
    referringTo: row.referring_to,
    city: row.city,
    date: row.receipt_date,
    signerName: row.signer_name,
    signerDocument: row.signer_document,
    createdAt: row.created_at,
  };
}

function receiptPayload(receipt: Receipt) {
  return {
    amount: receipt.amount,
    received_from: receipt.receivedFrom.trim(),
    amount_description: receipt.amountDescription.trim(),
    referring_to: receipt.referringTo.trim(),
    city: receipt.city.trim(),
    receipt_date: receipt.date,
    signer_name: receipt.signerName.trim(),
    signer_document: receipt.signerDocument.trim(),
  };
}

export async function listReceipts(): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ReceiptRow[]).map(mapReceiptRow);
}

// The database assigns the final number atomically, even when two devices save together.
export async function saveReceiptToDatabase(receipt: Receipt): Promise<Receipt> {
  if (receipt.id) {
    const { data, error } = await supabase
      .from("receipts")
      .update(receiptPayload(receipt))
      .eq("id", receipt.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapReceiptRow(data as ReceiptRow);
  }

  const { data, error } = await supabase
    .from("receipts")
    .insert(receiptPayload(receipt))
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapReceiptRow(data as ReceiptRow);
}

export async function deleteReceiptFromDatabase(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("receipts")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Recibo não encontrado ou acesso não permitido");
}

// Import is explicitly user-initiated. Existing local records remain untouched.
// If a legacy number is already taken, the server safely assigns the next number.
export async function importLocalReceipt(receipt: Receipt): Promise<Receipt> {
  const desiredNumber = Number(receipt.number);
  const { data, error } = await supabase
    .from("receipts")
    .insert({
      id: receipt.id,
      ...receiptPayload(receipt),
      receipt_number: Number.isSafeInteger(desiredNumber) && desiredNumber > 0
        ? desiredNumber
        : null,
      ...(receipt.createdAt && Number.isFinite(Date.parse(receipt.createdAt))
        ? { created_at: receipt.createdAt }
        : {}),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapReceiptRow(data as ReceiptRow);
}
