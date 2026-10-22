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

/** Inclusive date range on YYYY-MM-DD strings. An empty end means "no limit". */
export interface DateRange {
  from: string;
  to: string;
}

export const NO_DATE_RANGE: DateRange = { from: "", to: "" };

export function inDateRange(date: string | undefined, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  if (!date) return false;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

export type UnitStatusFilter = "all" | "in-stock" | "deleted";
export type PlanStatusFilter = "all" | "active" | "completed" | "deleted";

/** Units tab: filter by purchase date and by deleted or not. */
export function filterUnits(rows: UnitRecord[], range: DateRange, status: UnitStatusFilter): UnitRecord[] {
  return rows.filter((u) => {
    if (!inDateRange(u.date, range)) return false;
    if (status === "in-stock") return !u.deleted;
    if (status === "deleted") return u.deleted === true;
    return true;
  });
}

/** Installments tab: filter by next due date and by plan status. */
export function filterPlans(rows: InstallmentRecord[], range: DateRange, status: PlanStatusFilter): InstallmentRecord[] {
  return rows.filter((p) => {
    if (!inDateRange(p.nextDueDate, range)) return false;
    if (status === "deleted") return p.deleted === true;
    if (status === "active") return !p.deleted && p.status === "active";
    if (status === "completed") return !p.deleted && p.status === "completed";
    return true;
  });
}
