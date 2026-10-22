/** Test helpers: the scrubbed 22 Oct 2026 export, parsed. Used only by *.test.ts files. */
import raw from "../../tests/fixtures/scrubbed-transactions.json";
import { parseTransactions } from "./schemas";
import type { InstallmentRecord, TransactionRecord, UnitRecord } from "./schemas";
import type { WriteContext } from "./plan";

export const records: TransactionRecord[] = parseTransactions(raw.transactions).records;

export const ctx: WriteContext = {
  today: "2026-10-22",
  now: 1792000000000,
  email: "partner-a@example.com",
};

export function findUnit(transactionId: string): UnitRecord {
  const found = records.find((r): r is UnitRecord => r.type === "unit" && r.transactionId === transactionId);
  if (!found) throw new Error(`Unit ${transactionId} not in fixture`);
  return found;
}

export function findPlan(transactionId: string): InstallmentRecord {
  const found = records.find(
    (r): r is InstallmentRecord => r.type === "installment" && r.transactionId === transactionId,
  );
  if (!found) throw new Error(`Plan ${transactionId} not in fixture`);
  return found;
}

export function findUnitByKey(key: string): UnitRecord | undefined {
  return records.find((r): r is UnitRecord => r.type === "unit" && r.key === key);
}

/** IDs like TXN-901, TXN-902 ... for build(). */
export function fakeIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `TXN-${901 + i}`);
}
