/**
 * Unit status rules.
 *
 *   in-stock -> sold          (immediate sale)
 *   in-stock -> installment   (a plan is created)
 *   installment -> sold       (the plan is fully paid)
 *   installment -> in-stock   (the plan is deleted)
 *
 * Only an in-stock unit can be sold or put on a plan. Missing status counts as in-stock,
 * like the live app.
 */
import { refuse } from "./plan";
import type { Refusal } from "./plan";
import type { UnitRecord } from "./schemas";

export function effectiveStatus(unit: Pick<UnitRecord, "status">): string {
  return unit.status || "in-stock";
}

/** Shown in the Units tab and in the installment unit dropdown. */
export function isAvailable(unit: UnitRecord): boolean {
  return !unit.deleted && effectiveStatus(unit) === "in-stock";
}

/** Null when the unit can be sold now; otherwise why not. */
export function sellRefusal(unit: UnitRecord): Refusal | null {
  if (unit.deleted) return refuse("unit-deleted", "This unit is deleted. Restore it first.");
  const status = effectiveStatus(unit);
  if (status === "sold") {
    return refuse("already-sold", `This unit is already sold (${unit.transactionId}). Nothing was recorded.`);
  }
  if (status === "installment") {
    const plan = unit.installmentId ? ` (${unit.installmentId})` : "";
    return refuse(
      "on-installment",
      `This unit is on an installment plan${plan}.\nRecord payments in the Installment tab. The unit moves to Sold automatically when it is fully paid.`,
    );
  }
  return null;
}

/** Null when the unit can be put on an installment plan now; otherwise why not. */
export function startInstallmentRefusal(unit: UnitRecord): Refusal | null {
  if (unit.deleted) return refuse("unit-deleted", "Unit not found");
  if (effectiveStatus(unit) !== "in-stock") {
    return refuse(
      "unit-not-in-stock",
      "This unit is no longer in stock, so it cannot be put on an installment plan.",
    );
  }
  return null;
}

export interface UnitMoneyChange {
  cost?: number;
  /** null means "clear the sold price". */
  soldFor?: number | null;
}

/**
 * A unit that is on, or was sold through, an installment plan cannot have its cost or
 * sold price changed: the plan's income and fund-return rows are built from them.
 * Name, category, IMEI, condition, date and suggested price can always change.
 */
export function unitEditRefusal(unit: UnitRecord, change: UnitMoneyChange): Refusal | null {
  const linked = effectiveStatus(unit) === "installment" || unit.installmentId !== undefined;
  if (!linked) return null;

  const costChanged = change.cost !== undefined && change.cost !== unit.cost;
  const soldForChanged = change.soldFor !== undefined && change.soldFor !== (unit.soldFor ?? null);
  if (!costChanged && !soldForChanged) return null;

  return refuse(
    "installment-money-locked",
    "This unit is on, or was sold through, an installment plan, so its cost and sold price cannot be changed here.\nYou can edit the name, category, IMEI, condition, date and suggested price.",
  );
}
