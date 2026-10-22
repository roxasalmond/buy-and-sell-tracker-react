/**
 * Reconciliation: consistency checks on a full database export, and a diff between two exports.
 * Pure functions, no Firebase. The script `scripts/reconcile.ts` reads files and prints the result.
 *
 * Findings listed in KNOWN_ISSUES are problems that already exist in the real data (see the
 * migration plan, section 8). They are reported separately so a NEW problem stands out.
 */
import { round2 } from "../lib/money";
import { computeSummary } from "./summary";
import type { Summary } from "./summary";
import { parseTransactions } from "./schemas";
import type { InstallmentRecord, TransactionRecord, UnitRecord } from "./schemas";

export interface Finding {
  /** Short stable code, used to match KNOWN_ISSUES. */
  code: string;
  /** TXN number of the record the finding is about. */
  txn: string;
  message: string;
}

/** `code:TXN` pairs that exist in the 22 Oct 2026 data and are understood (plan section 8). */
export const KNOWN_ISSUES: ReadonlySet<string> = new Set([
  "sold-rows-on-unit-not-sold:TXN-045", // iPad: TXN-060 / TXN-061 kept on purpose
  "expense-differs-from-cost:TXN-003", // cost 6,000 vs expense 10,000, from an old cost edit
  "plan-negative-balance:TXN-085", // overpayment case, cosmetic
  "orphan-installment-ref:TXN-215", // fund-return points at a missing installment
  "deleted-plan-still-active:TXN-538",
  "sold-unit-missing-sold-by:TXN-087",
]);

export interface ExportFile {
  metadata?: { transactionCounter?: number };
  transactions?: unknown;
}

export interface ReconcileResult {
  recordCount: number;
  counter: number | null;
  summary: Summary;
  parseErrors: { key: string; message: string }[];
  /** Problems not in KNOWN_ISSUES. An empty list is the goal. */
  problems: Finding[];
  /** Problems already understood. */
  known: Finding[];
}

function txnNumber(id: string): number {
  const n = Number(id.replace(/^TXN-/, ""));
  return Number.isFinite(n) ? n : 0;
}

export function reconcile(file: ExportFile): ReconcileResult {
  const { records, errors } = parseTransactions(file.transactions);
  const found: Finding[] = [];
  const add = (code: string, txn: string, message: string) => found.push({ code, txn, message });

  const counter = typeof file.metadata?.transactionCounter === "number" ? file.metadata.transactionCounter : null;

  // 1. Transaction numbers: no duplicates, counter at or above the highest number.
  const seen = new Map<string, string>();
  let highest = 0;
  for (const r of records) {
    const first = seen.get(r.transactionId);
    if (first !== undefined) add("duplicate-txn", r.transactionId, `Used by two records (${first} and ${r.key}).`);
    else seen.set(r.transactionId, r.key);
    highest = Math.max(highest, txnNumber(r.transactionId));
  }
  if (counter === null) add("counter-missing", "metadata", "metadata/transactionCounter is missing.");
  else if (counter < highest) {
    add("counter-behind", "metadata", `Counter is ${counter} but TXN-${highest} exists: the next save would reuse a number.`);
  }

  const live = records.filter((r) => !r.deleted);
  const unitsByKey = new Map<string, UnitRecord>();
  for (const r of records) if (r.type === "unit") unitsByKey.set(r.key, r);
  const plansById = new Map<string, InstallmentRecord>();
  for (const r of records) if (r.type === "installment") plansById.set(r.transactionId, r);

  // 2. Plans against their ledger rows.
  for (const plan of records) {
    if (plan.type !== "installment") continue;
    const id = plan.transactionId;
    if (plan.deleted) {
      if (plan.status === "active") add("deleted-plan-still-active", id, "Deleted plan is still marked active.");
      continue;
    }
    let capital = 0;
    let income = 0;
    let profitReturns = 0;
    for (const r of live) {
      if (r.type === "fund-return" && r.installmentId === id) {
        if (r.saleType === "installment-capital") capital += r.amount;
        if (r.saleType === "installment-profit") profitReturns += r.amount;
      } else if (r.type === "income" && r.installmentId === id) {
        income += r.profit;
      }
    }
    if (round2(capital) !== plan.capitalRecovered) {
      add("plan-capital-mismatch", id, `Plan says ${plan.capitalRecovered} recovered, ledger rows add up to ${round2(capital)}.`);
    }
    if (round2(income) !== plan.profitProcessed) {
      add("plan-profit-mismatch", id, `Plan says ${plan.profitProcessed} profit, income rows add up to ${round2(income)}.`);
    }
    if (round2(profitReturns) !== round2(plan.profitProcessed / 2)) {
      add("plan-profit-return-mismatch", id, `Profit fund-returns add up to ${round2(profitReturns)}, expected ${round2(plan.profitProcessed / 2)}.`);
    }
    if (plan.balanceRemaining < 0) add("plan-negative-balance", id, `Balance is ${plan.balanceRemaining}.`);
    if (plan.status === "active" && plan.balanceRemaining <= 0) add("plan-active-but-paid", id, "Active plan with nothing left to pay.");
    if (plan.status === "completed" && plan.balanceRemaining > 0) add("plan-completed-but-owing", id, `Completed plan with ${plan.balanceRemaining} still owing.`);

    const unit = unitsByKey.get(plan.unitId);
    if (!unit) add("plan-unit-missing", id, "The plan's unit does not exist.");
    else if (unit.deleted) add("plan-unit-deleted", id, `Live plan on deleted unit ${unit.transactionId}.`);
    else if (plan.status === "active" && (unit.status !== "installment" || unit.installmentId !== id)) {
      add("active-plan-unit-status", id, `Unit ${unit.transactionId} is "${unit.status}", expected "installment" linked to this plan.`);
    } else if (plan.status === "completed" && unit.status !== "sold") {
      add("completed-plan-unit-status", id, `Unit ${unit.transactionId} is "${unit.status}", expected "sold".`);
    }
  }

  // 3. Units against plans, expenses and sale rows.
  const liveExpenseByUnit = new Map<string, number[]>();
  const anyExpenseByUnit = new Map<string, TransactionRecord[]>();
  for (const r of records) {
    if (r.type !== "expense") continue;
    anyExpenseByUnit.set(r.unitId, [...(anyExpenseByUnit.get(r.unitId) ?? []), r]);
    if (!r.deleted) liveExpenseByUnit.set(r.unitId, [...(liveExpenseByUnit.get(r.unitId) ?? []), r.amount]);
  }
  const immediateSaleRows = new Map<string, number>();
  for (const r of live) {
    if ((r.type === "fund-return" || r.type === "income") && r.installmentId === undefined) {
      immediateSaleRows.set(r.unitId, (immediateSaleRows.get(r.unitId) ?? 0) + 1);
    }
  }
  for (const unit of records) {
    if (unit.type !== "unit") continue;
    const id = unit.transactionId;
    if (unit.deleted) {
      if ((liveExpenseByUnit.get(unit.key) ?? []).length > 0) {
        add("deleted-unit-live-expense", id, "Deleted unit still has a live purchase expense.");
      }
      continue;
    }
    const expenses = liveExpenseByUnit.get(unit.key) ?? [];
    if (expenses.length === 0) add("unit-no-expense", id, "Live unit has no live purchase expense.");
    else if (expenses.length > 1) add("unit-many-expenses", id, `Live unit has ${expenses.length} live purchase expenses.`);
    else if (round2(expenses[0] ?? 0) !== round2(unit.cost)) {
      add("expense-differs-from-cost", id, `Cost ${unit.cost}, expense ${expenses[0]}.`);
    }
    if (unit.status === "installment") {
      const plan = unit.installmentId ? plansById.get(unit.installmentId) : undefined;
      if (!plan || plan.deleted || plan.status !== "active") {
        add("installment-unit-no-active-plan", id, "Unit is on installment but has no live active plan.");
      }
    }
    if (unit.status === "sold") {
      if (unit.soldFor === undefined || unit.soldDate === undefined) add("sold-unit-missing-fields", id, "Sold unit without soldFor or soldDate.");
      if (unit.soldBy === undefined) add("sold-unit-missing-sold-by", id, "Sold unit without soldBy.");
      const viaPlan = unit.installmentId !== undefined;
      if (!viaPlan && (immediateSaleRows.get(unit.key) ?? 0) === 0) {
        add("sold-unit-no-sale-rows", id, "Sold unit with no live sale fund-return or income row.");
      }
    } else if ((immediateSaleRows.get(unit.key) ?? 0) > 0) {
      add("sold-rows-on-unit-not-sold", id, `Unit is "${unit.status}" but has live immediate-sale rows.`);
    }
  }

  // 4. Orphans and arithmetic on ledger rows.
  for (const r of live) {
    if (r.type === "income" && round2(r.dividedAmount) !== round2(r.profit / 2)) {
      add("income-not-half", r.transactionId, `Profit ${r.profit}, divided ${r.dividedAmount}.`);
    }
    if (r.type === "fund-return" || r.type === "income") {
      if (r.installmentId !== undefined && !plansById.has(r.installmentId)) {
        add("orphan-installment-ref", r.transactionId, `Points at missing plan ${r.installmentId}.`);
      }
      if (!unitsByKey.has(r.unitId)) add("orphan-unit-ref", r.transactionId, "Points at a missing unit.");
    }
    if (r.type === "expense" && !unitsByKey.has(r.unitId)) add("orphan-unit-ref", r.transactionId, "Expense points at a missing unit.");
  }

  const problems = found.filter((f) => !KNOWN_ISSUES.has(`${f.code}:${f.txn}`));
  const known = found.filter((f) => KNOWN_ISSUES.has(`${f.code}:${f.txn}`));
  return { recordCount: records.length, counter, summary: computeSummary(records), parseErrors: errors, problems, known };
}

export interface RecordChange {
  key: string;
  txn: string;
  type: string;
  kind: "added" | "removed" | "changed";
  /** For "changed": the fields that differ, as `field: before -> after`. */
  fields: string[];
}

function show(v: unknown): string {
  return typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) ?? "undefined";
}

/** What changed between two exports (before -> after), by push key. */
export function diffExports(before: ExportFile, after: ExportFile): RecordChange[] {
  const a = (before.transactions ?? {}) as Record<string, Record<string, unknown>>;
  const b = (after.transactions ?? {}) as Record<string, Record<string, unknown>>;
  const changes: RecordChange[] = [];
  const label = (rec: Record<string, unknown>) => ({
    txn: typeof rec["transactionId"] === "string" ? rec["transactionId"] : "?",
    type: typeof rec["type"] === "string" ? rec["type"] : "?",
  });
  for (const [key, rec] of Object.entries(b)) {
    const old = a[key];
    if (!old) {
      changes.push({ key, ...label(rec), kind: "added", fields: [] });
      continue;
    }
    const fields: string[] = [];
    for (const f of new Set([...Object.keys(old), ...Object.keys(rec)])) {
      if (JSON.stringify(old[f]) !== JSON.stringify(rec[f])) fields.push(`${f}: ${show(old[f])} -> ${show(rec[f])}`);
    }
    if (fields.length > 0) changes.push({ key, ...label(rec), kind: "changed", fields });
  }
  for (const [key, rec] of Object.entries(a)) {
    if (!b[key]) changes.push({ key, ...label(rec), kind: "removed", fields: [] });
  }
  return changes.sort((x, y) => txnNumber(x.txn) - txnNumber(y.txn));
}
