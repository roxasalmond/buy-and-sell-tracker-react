/**
 * Undo a sale and redo it (immediate sales only).
 *
 *   undo   the sale's income and fund-return rows are soft-deleted, the unit goes back
 *          to in-stock and its sold fields are cleared. Fund, income and inventory return
 *          to what they were before the sale.
 *   redo   the rows deleted together are restored and the unit is sold again at the same
 *          price. Started from the deleted fund-return row in the Funds tab.
 *
 * A unit sold through an installment plan is not handled here: its rows belong to the
 * plan, so deleting the plan is the way to undo it.
 */
import { round2 } from "../lib/money";
import { idPicker, refuse } from "./plan";
import type { Patch, PlanResult, WriteContext } from "./plan";
import type { FundReturn, Income, Unit, UnitRecord } from "./schemas";
import { effectiveStatus } from "./unitStatus";

type LedgerRecord = (Income | FundReturn) & { key: string };
type FundReturnRecord = FundReturn & { key: string };

export interface SaleReversal {
  unitPatch: Patch<Record<string, unknown>>;
  ledgerPatches: Patch<Income | FundReturn>[];
}

function saleRows(unit: UnitRecord, records: readonly { type: string }[]): LedgerRecord[] {
  return (records as readonly (LedgerRecord | { type: string })[]).filter(
    (r): r is LedgerRecord =>
      (r.type === "income" || r.type === "fund-return") &&
      (r as LedgerRecord).unitId === unit.key &&
      (r as LedgerRecord).installmentId === undefined,
  );
}

export function planUndoSale(
  unit: UnitRecord,
  records: readonly { type: string }[],
  ctx: WriteContext,
): PlanResult<SaleReversal> {
  if (unit.deleted) return refuse("unit-deleted", "This unit is deleted. Restore it first.");
  if (effectiveStatus(unit) !== "sold") return refuse("invalid-input", "This unit is not sold, so there is no sale to undo.");
  if (unit.installmentId !== undefined) {
    return refuse(
      "on-installment",
      `This unit was sold through installment ${unit.installmentId}. Delete that installment in the Installments tab to undo it.`,
    );
  }

  const rows = saleRows(unit, records).filter((r) => !r.deleted);
  return {
    ok: true,
    idCount: 0,
    build(ids) {
      idPicker(ids, 0);
      const gone = { deleted: true, deletedBy: ctx.email, deletedAt: ctx.now };
      return {
        unitPatch: {
          key: unit.key,
          fields: { status: "in-stock", soldFor: null, soldDate: null, soldBy: null, soldAt: null },
        },
        ledgerPatches: rows.map((r) => ({ key: r.key, fields: gone })),
      };
    },
  };
}

export function planRedoSale(
  fundReturn: FundReturnRecord,
  unit: UnitRecord | undefined,
  records: readonly { type: string }[],
  ctx: WriteContext,
): PlanResult<SaleReversal> {
  if (!fundReturn.deleted) return refuse("entry-not-deleted", "This entry is not deleted.");
  if (fundReturn.installmentId !== undefined) {
    return refuse("on-installment", "This row belongs to an installment. Restore the installment instead.");
  }
  if (!unit) return refuse("unit-missing", "The unit for this sale no longer exists.");
  if (unit.deleted) return refuse("unit-deleted", "The unit is deleted. Restore it first.");
  if (effectiveStatus(unit) !== "in-stock") {
    return refuse(
      "unit-not-in-stock",
      "This unit is no longer in stock (it was sold again or put on an installment), so the old sale cannot be redone.",
    );
  }

  // The rows deleted together with this one.
  const rows = saleRows(unit, records).filter((r) => r.deleted && r.deletedAt === fundReturn.deletedAt);
  const income = rows.find((r): r is Income & { key: string } => r.type === "income");

  // Profit sale: cost + half profit came back, so sold price = fund-return + half profit.
  // Loss or break-even: the fund-return is the sold price.
  let soldFor: number;
  if (income) {
    const originalCost = round2(fundReturn.amount - income.dividedAmount);
    if (originalCost !== unit.cost) {
      return refuse(
        "invalid-input",
        "The unit's cost was changed after the sale was undone, so the old sale no longer adds up. Sell the unit again instead.",
      );
    }
    soldFor = round2(fundReturn.amount + income.dividedAmount);
  } else {
    soldFor = fundReturn.amount;
  }

  return {
    ok: true,
    idCount: 0,
    build(ids) {
      idPicker(ids, 0);
      const back = { deleted: false, restoredBy: ctx.email, restoredAt: ctx.now };
      const fields: Partial<Unit> = {
        status: "sold",
        soldFor,
        soldDate: fundReturn.date,
        soldBy: ctx.email,
        soldAt: ctx.now,
      };
      return {
        unitPatch: { key: unit.key, fields },
        ledgerPatches: rows.map((r) => ({ key: r.key, fields: back })),
      };
    },
  };
}
