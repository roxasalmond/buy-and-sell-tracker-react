/**
 * Add Fund and Remit: one row each, no side effects on other records.
 *
 * A fund is money put into the pool; a remit is a partner taking money out. A remit may
 * be made in advance, so its date is allowed to be in the future. Same record shape as
 * the live app: type, transactionId, date, amount, createdBy, createdAt, timestamp.
 */
import { round2 } from "../lib/money";
import { idPicker, refuse } from "./plan";
import type { PlanResult, Refusal, WriteContext } from "./plan";
import type { Fund, Remit } from "./schemas";

export interface CashEntryResult<T> {
  create: [T];
}

/** Real calendar date in YYYY-MM-DD form. */
export function isValidDateString(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(mo) - 1 && date.getUTCDate() === Number(d)
  );
}

function check(amount: number, date: string): Refusal | null {
  if (!Number.isFinite(amount) || amount <= 0) return refuse("invalid-amount", "Please enter an amount above zero");
  if (!isValidDateString(date)) return refuse("invalid-input", "Please pick a valid date");
  return null;
}

export function planAddFund(amount: number, date: string, ctx: WriteContext): PlanResult<CashEntryResult<Fund>> {
  const refusal = check(amount, date);
  if (refusal) return refusal;
  return {
    ok: true,
    idCount: 1,
    build(ids) {
      const id = idPicker(ids, 1);
      return {
        create: [
          {
            type: "fund",
            transactionId: id(0),
            date,
            amount: round2(amount),
            createdBy: ctx.email,
            createdAt: ctx.now,
            timestamp: ctx.now,
          },
        ],
      };
    },
  };
}

/** A remit date in the future is fine (remitted in advance). */
export function planAddRemit(amount: number, date: string, ctx: WriteContext): PlanResult<CashEntryResult<Remit>> {
  const refusal = check(amount, date);
  if (refusal) return refusal;
  return {
    ok: true,
    idCount: 1,
    build(ids) {
      const id = idPicker(ids, 1);
      return {
        create: [
          {
            type: "remit",
            transactionId: id(0),
            date,
            amount: round2(amount),
            createdBy: ctx.email,
            createdAt: ctx.now,
            timestamp: ctx.now,
          },
        ],
      };
    },
  };
}
