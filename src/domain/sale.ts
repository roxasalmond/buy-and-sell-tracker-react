/**
 * Immediate sale of a unit.
 *
 * profit = sold - cost. With a profit: one income row (profit, divided = profit / 2) and
 * one fund-return of cost + profit / 2. Break-even or loss: no income row and one
 * fund-return of the sold price.
 */
import { round2 } from "../lib/money";
import { idPicker, refuse } from "./plan";
import type { Patch, PlanResult, WriteContext } from "./plan";
import type { FundReturn, Income, Unit, UnitRecord } from "./schemas";
import { sellRefusal } from "./unitStatus";

export interface SaleResult {
  profit: number;
  /** New ledger rows, with their transaction IDs filled in. */
  create: (Income | FundReturn)[];
  /** Changes to the unit. */
  unitPatch: Patch<Unit>;
}

export function planImmediateSale(
  unit: UnitRecord,
  soldAmount: number,
  ctx: WriteContext,
): PlanResult<SaleResult> {
  if (!Number.isFinite(soldAmount) || soldAmount <= 0) {
    return refuse("invalid-amount", "Please enter a valid sold amount");
  }
  const refusal = sellRefusal(unit);
  if (refusal) return refusal;

  const profit = round2(soldAmount - unit.cost);
  const idCount = profit > 0 ? 2 : 1;

  return {
    ok: true,
    idCount,
    build(ids) {
      const id = idPicker(ids, idCount);
      const common = {
        unitId: unit.key,
        unitName: unit.name,
        date: ctx.today,
        createdBy: ctx.email,
        createdAt: ctx.now,
        timestamp: ctx.now,
      };

      const create: (Income | FundReturn)[] = [];
      if (profit > 0) {
        const half = profit / 2;
        create.push({ type: "income", transactionId: id(0), profit, dividedAmount: half, ...common });
        create.push({ type: "fund-return", transactionId: id(1), amount: round2(unit.cost + half), ...common });
      } else {
        // Break-even or loss: the fund gets back exactly what the unit sold for.
        create.push({ type: "fund-return", transactionId: id(0), amount: soldAmount, ...common });
      }

      return {
        profit,
        create,
        unitPatch: {
          key: unit.key,
          fields: {
            status: "sold",
            soldFor: soldAmount,
            soldDate: ctx.today,
            soldBy: ctx.email,
            soldAt: ctx.now,
          },
        },
      };
    },
  };
}
