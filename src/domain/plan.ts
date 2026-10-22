/**
 * Shared shapes for the "plan" functions in this folder (sale.ts, installment.ts).
 *
 * A plan function only DECIDES: it validates, does the money maths and describes what
 * should be written. It never touches Firebase. The data layer (phase 4) reserves the
 * transaction IDs, calls `build(ids)`, and saves everything in one multi-path update.
 */

export type RefusalReason =
  | "invalid-amount"
  | "invalid-input"
  | "unit-deleted"
  | "already-sold"
  | "on-installment"
  | "unit-not-in-stock"
  | "down-payment-covers-price"
  | "plan-deleted"
  | "plan-completed"
  | "overpayment-needs-confirmation"
  | "unit-missing"
  | "installment-money-locked"
  | "entry-deleted"
  | "entry-not-deleted";

export interface Refusal {
  ok: false;
  reason: RefusalReason;
  /** Text that can be shown to the user as is. */
  message: string;
  /** Only for "overpayment-needs-confirmation". */
  overpayment?: { extra: number; newTotalPrice: number };
}

export interface Planned<R> {
  ok: true;
  /** How many transaction IDs build() needs (reserve exactly this many, atomically). */
  idCount: number;
  build: (ids: readonly string[]) => R;
}

export type PlanResult<R> = Planned<R> | Refusal;

export interface WriteContext {
  /** Local date, YYYY-MM-DD (see lib/dates.ts). */
  today: string;
  /** Epoch ms. */
  now: number;
  /** Who is doing it. */
  email: string;
}

/** A change to an existing record: only these fields are written. */
export interface Patch<T> {
  key: string;
  fields: Partial<T>;
}

export function refuse(reason: RefusalReason, message: string): Refusal {
  return { ok: false, reason, message };
}

/** Returns a function that hands out the reserved IDs, and fails loudly on a wrong count. */
export function idPicker(ids: readonly string[], expected: number): (index: number) => string {
  if (ids.length !== expected) {
    throw new Error(`Expected ${expected} transaction IDs but got ${ids.length}`);
  }
  return (index: number) => {
    const id = ids[index];
    if (id === undefined) throw new Error(`Missing transaction ID at index ${index}`);
    return id;
  };
}
