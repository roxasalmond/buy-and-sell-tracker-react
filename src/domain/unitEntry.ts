/**
 * Add Unit: the unit row plus the purchase expense that takes its cost out of the fund.
 *
 * Same record shapes as the live app. The expense points at the unit by its push key, so
 * the caller creates that key first and passes it in (`unitKey`); the unit and the
 * expense are then saved together in one update.
 */
import { round2 } from "../lib/money";
import { isValidDateString } from "./cashEntry";
import { idPicker, refuse } from "./plan";
import type { PlanResult, WriteContext } from "./plan";
import type { Expense, Unit } from "./schemas";

export const UNIT_CATEGORIES = ["Android", "IOS", "Laptop"] as const;
export const UNIT_CONDITIONS = ["Brandnew", "Second Hand", "Refurbished"] as const;
export type UnitCategory = (typeof UNIT_CATEGORIES)[number];
export type UnitCondition = (typeof UNIT_CONDITIONS)[number];

/** Phones need an IMEI; laptops do not. */
export function needsImei(category: string): boolean {
  return category === "Android" || category === "IOS";
}

export interface AddUnitInput {
  name: string;
  category: string;
  condition: string;
  imei: string;
  date: string;
  cost: number;
  suggestedPrice: number;
  /** Cloudinary URL, uploaded before saving. */
  photoURL: string;
}

export interface AddUnitResult {
  unit: Unit;
  expense: Expense;
}

export function planAddUnit(input: AddUnitInput, unitKey: string, ctx: WriteContext): PlanResult<AddUnitResult> {
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
  if (!input.photoURL) return refuse("invalid-input", "Please upload a photo of the unit.");

  const cost = round2(input.cost);

  return {
    ok: true,
    idCount: 2,
    build(ids) {
      const pick = idPicker(ids, 2);
      const common = { createdBy: ctx.email, createdAt: ctx.now, timestamp: ctx.now };
      const unit: Unit = {
        type: "unit",
        transactionId: pick(0),
        name,
        category: input.category,
        imei,
        condition: input.condition,
        date: input.date,
        cost,
        suggestedPrice: round2(input.suggestedPrice),
        photoURL: input.photoURL,
        status: "in-stock",
        ...common,
      };
      const expense: Expense = {
        type: "expense",
        transactionId: pick(1),
        unitId: unitKey,
        date: input.date,
        amount: cost,
        reason: `Unit purchase: ${name}`,
        ...common,
      };
      return { unit, expense };
    },
  };
}
