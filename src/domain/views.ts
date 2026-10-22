/**
 * What each tab shows. Deleted rows stay in the lists (struck through), like the live app.
 * Newest first, by the number in the TXN id.
 */
import { effectiveStatus } from "./unitStatus";
import type {
  Fund,
  FundReturn,
  InstallmentRecord,
  Remit,
  TransactionRecord,
  UnitRecord,
} from "./schemas";

export function txnNumber(id: string): number {
  const n = Number(/(\d+)$/.exec(id)?.[1]);
  return Number.isFinite(n) ? n : 0;
}

function newestFirst<T extends { transactionId: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => txnNumber(b.transactionId) - txnNumber(a.transactionId));
}

type WithKey<T> = T & { key: string };

export function unitsInStock(records: readonly TransactionRecord[]): UnitRecord[] {
  const rows: UnitRecord[] = [];
  for (const r of records) {
    if (r.type === "unit" && effectiveStatus(r) === "in-stock") rows.push(r);
  }
  return newestFirst(rows);
}

export function soldUnits(records: readonly TransactionRecord[]): UnitRecord[] {
  const rows: UnitRecord[] = [];
  for (const r of records) {
    if (r.type === "unit" && r.status === "sold") rows.push(r);
  }
  return newestFirst(rows);
}

export function installmentPlans(records: readonly TransactionRecord[]): InstallmentRecord[] {
  const rows: InstallmentRecord[] = [];
  for (const r of records) {
    if (r.type === "installment") rows.push(r);
  }
  return newestFirst(rows);
}

export function fundRows(records: readonly TransactionRecord[]): WithKey<Fund | FundReturn>[] {
  const rows: WithKey<Fund | FundReturn>[] = [];
  for (const r of records) {
    if (r.type === "fund" || r.type === "fund-return") rows.push(r);
  }
  return newestFirst(rows);
}

export function remitRows(records: readonly TransactionRecord[]): WithKey<Remit>[] {
  const rows: WithKey<Remit>[] = [];
  for (const r of records) {
    if (r.type === "remit") rows.push(r);
  }
  return newestFirst(rows);
}
