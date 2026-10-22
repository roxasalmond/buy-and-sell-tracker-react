/**
 * Edit, delete and restore for fund and remit rows (the simple ones).
 *
 * Same fields as the live app:
 *   edit     amount, date, editedBy, editedAt
 *   delete   deleted: true,  deletedAt, deletedBy      (soft delete, the row stays)
 *   restore  deleted: false, restoredAt, restoredBy
 * Deleted rows are skipped by the summary, so these change the fund card right away.
 *
 * Fund-returns that belong to a sale are NOT handled here: removing one has to undo the
 * sale, which is a separate flow.
 */
import { round2 } from "../lib/money";
import { isValidDateString } from "./cashEntry";
import { idPicker, refuse } from "./plan";
import type { Patch, PlanResult, WriteContext } from "./plan";
import type { Fund, Remit } from "./schemas";

export type CashRow = (Fund | Remit) & { key: string };

export type CashFields = Pick<
  Fund,
  "amount" | "date" | "editedBy" | "editedAt" | "deleted" | "deletedBy" | "deletedAt" | "restoredBy" | "restoredAt"
>;

export interface CashChange {
  patch: Patch<CashFields>;
}

export function planEditCashRow(
  row: CashRow,
  input: { amount: number; date: string },
  ctx: WriteContext,
): PlanResult<CashChange> {
  if (row.deleted) return refuse("entry-deleted", "This entry is deleted. Restore it before editing.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return refuse("invalid-amount", "Please enter an amount above zero");
  }
  if (!isValidDateString(input.date)) return refuse("invalid-input", "Please pick a valid date");

  const amount = round2(input.amount);
  if (amount === row.amount && input.date === row.date) {
    return refuse("invalid-input", "Nothing was changed");
  }

  return {
    ok: true,
    idCount: 0,
    build(ids) {
      idPicker(ids, 0);
      return {
        patch: { key: row.key, fields: { amount, date: input.date, editedBy: ctx.email, editedAt: ctx.now } },
      };
    },
  };
}

export function planDeleteCashRow(row: CashRow, ctx: WriteContext): PlanResult<CashChange> {
  if (row.deleted) return refuse("entry-deleted", "This entry is already deleted.");
  return {
    ok: true,
    idCount: 0,
    build(ids) {
      idPicker(ids, 0);
      return {
        patch: { key: row.key, fields: { deleted: true, deletedBy: ctx.email, deletedAt: ctx.now } },
      };
    },
  };
}

export function planRestoreCashRow(row: CashRow, ctx: WriteContext): PlanResult<CashChange> {
  if (!row.deleted) return refuse("entry-not-deleted", "This entry is not deleted.");
  return {
    ok: true,
    idCount: 0,
    build(ids) {
      idPicker(ids, 0);
      return {
        patch: { key: row.key, fields: { deleted: false, restoredBy: ctx.email, restoredAt: ctx.now } },
      };
    },
  };
}
