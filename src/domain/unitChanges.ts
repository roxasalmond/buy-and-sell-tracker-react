/**
 * Edit, delete and restore for units that are in stock (the Available Units tab).
 *
 * The purchase expense belongs to the unit, so it moves with it:
 *   edit     a new cost (or date) is written to the expense too, so the fund and the
 *            inventory can never drift apart (the live app only changed the unit)
 *   delete   unit and expense are soft-deleted together: the money goes back to the fund
 *   restore  both come back; an expense deleted on its own earlier stays deleted
 * A unit that is sold or on an installment plan is refused: undo the sale (or delete the
 * plan) first, so no income or fund-return rows are left behind.
 */
import { round2 } from "../lib/money";
import { isValidDateString } from "./cashEntry";
import { idPicker, refuse } from "./plan";
import type { Patch, PlanResult, Refusal, WriteContext } from "./plan";
import type { Expense, Unit, UnitRecord } from "./schemas";
import { UNIT_CATEGORIES, UNIT_CONDITIONS, needsImei } from "./unitEntry";
import { effectiveStatus } from "./unitStatus";

type ExpenseRecord = Expense & { key: string };

/** The purchase expense rows of a unit (matched by the unit's push key). */
function expensesOf(unit: UnitRecord, records: readonly { type: string }[]): ExpenseRecord[] {
  return (records as readonly (ExpenseRecord | { type: string })[]).filter(
    (r): r is ExpenseRecord => r.type === "expense" && (r as ExpenseRecord).unitId === unit.key,
  );
}

function stockRefusal(unit: UnitRecord, verb: string): Refusal | null {
  const status = effectiveStatus(unit);
  if (status === "sold") {
    return refuse(
      "already-sold",
      `This unit is sold (${unit.transactionId}), so it cannot be ${verb} here. Undo the sale first.`,
    );
  }
  if (status === "installment") {
    const plan = unit.installmentId ? ` (${unit.installmentId})` : "";
    return refuse(
      "on-installment",
      `This unit is on an installment plan${plan}, so it cannot be ${verb} here. Delete the installment first.`,
    );
  }
  return null;
}

export interface EditUnitInput {
  name: string;
  category: string;
  condition: string;
  imei: string;
  date: string;
  cost: number;
  suggestedPrice: number;
}

export interface UnitEditResult {
  unitPatch: Patch<Unit>;
  /** Present when the unit's expense has to follow a change of cost, date or name. */
  expensePatch?: Patch<Expense>;
}

export function planEditUnit(
  unit: UnitRecord,
  records: readonly { type: string }[],
  input: EditUnitInput,
  ctx: WriteContext,
): PlanResult<UnitEditResult> {
  if (unit.deleted) return refuse("unit-deleted", "This unit is deleted. Restore it before editing.");
  const stock = stockRefusal(unit, "edited");
  if (stock) return stock;

  const name = input.name.trim();
  if (!name) return refuse("invalid-input", "Please enter the unit name.");
  if (!(UNIT_CATEGORIES as readonly string[]).includes(input.category)) {
    return refuse("invalid-input", "Please choose a category.");
  }
  if (!(UNIT_CONDITIONS as readonly string[]).includes(input.condition)) {
    return refuse("invalid-input", "Please choose the condition.");
  }
  const imei = needsImei(input.category) ? input.imei.trim() : "";
  if (needsImei(input.category) && !imei) return refuse("invalid-input", "Please enter the IMEI.");
  if (!isValidDateString(input.date)) return refuse("invalid-input", "Please pick a valid date.");
  if (!Number.isFinite(input.cost) || input.cost <= 0) return refuse("invalid-amount", "Please enter the cost.");
  if (!Number.isFinite(input.suggestedPrice) || input.suggestedPrice <= 0) {
    return refuse("invalid-amount", "Please enter the suggested selling price.");
  }

  const cost = round2(input.cost);
  const suggestedPrice = round2(input.suggestedPrice);

  const unchanged =
    name === unit.name &&
    input.category === unit.category &&
    input.condition === unit.condition &&
    imei === unit.imei &&
    input.date === unit.date &&
    cost === unit.cost &&
    suggestedPrice === unit.suggestedPrice;
  if (unchanged) return refuse("invalid-input", "Nothing was changed");

  // The one live purchase expense, if there is exactly one to follow.
  const live = expensesOf(unit, records).filter((e) => !e.deleted);
  const expense = live.length === 1 ? live[0] : undefined;

  return {
    ok: true,
    idCount: 0,
    build(ids) {
      idPicker(ids, 0);
      const result: UnitEditResult = {
        unitPatch: {
          key: unit.key,
          fields: {
            name,
            category: input.category,
            condition: input.condition,
            imei,
            date: input.date,
            cost,
            suggestedPrice,
            editedBy: ctx.email,
            editedAt: ctx.now,
          },
        },
      };
      if (expense) {
        const fields: Partial<Expense> = {};
        if (expense.amount !== cost) fields.amount = cost;
        if (expense.date !== input.date) fields.date = input.date;
        // Keep the standard wording in step with a rename; a custom reason is left alone.
        if (name !== unit.name && expense.reason === `Unit purchase: ${unit.name}`) {
          fields.reason = `Unit purchase: ${name}`;
        }
        if (Object.keys(fields).length > 0) {
          result.expensePatch = { key: expense.key, fields: { ...fields, editedBy: ctx.email, editedAt: ctx.now } };
        }
      }
      return result;
    },
  };
}

export interface UnitReversal {
  unitPatch: Patch<Unit>;
  expensePatches: Patch<Expense>[];
}

export function planDeleteUnit(
  unit: UnitRecord,
  records: readonly { type: string }[],
  ctx: WriteContext,
): PlanResult<UnitReversal> {
  if (unit.deleted) return refuse("unit-deleted", "This unit is already deleted.");
  const stock = stockRefusal(unit, "deleted");
  if (stock) return stock;

  const expenses = expensesOf(unit, records).filter((e) => !e.deleted);
  return {
    ok: true,
    idCount: 0,
    build(ids) {
      idPicker(ids, 0);
      const gone = { deleted: true, deletedBy: ctx.email, deletedAt: ctx.now };
      return {
        unitPatch: { key: unit.key, fields: gone },
        expensePatches: expenses.map((e) => ({ key: e.key, fields: gone })),
      };
    },
  };
}

export function planRestoreUnit(
  unit: UnitRecord,
  records: readonly { type: string }[],
  ctx: WriteContext,
): PlanResult<UnitReversal> {
  if (!unit.deleted) return refuse("entry-not-deleted", "This unit is not deleted.");

  // Only the expense that was deleted together with the unit.
  const expenses = expensesOf(unit, records).filter((e) => e.deleted && e.deletedAt === unit.deletedAt);
  return {
    ok: true,
    idCount: 0,
    build(ids) {
      idPicker(ids, 0);
      const back = { deleted: false, restoredBy: ctx.email, restoredAt: ctx.now };
      return {
        unitPatch: { key: unit.key, fields: back },
        expensePatches: expenses.map((e) => ({ key: e.key, fields: back })),
      };
    },
  };
}
