import { round2 } from "../lib/money";
import type { Transaction } from "./schemas";

export interface Summary {
  /** Available fund: funds + fund-returns - remits - expenses. */
  fund: number;
  /** Cost of the units still in stock. */
  inventory: number;
  /** Cost of the units currently on an installment plan (not part of inventory). */
  installmentValue: number;
  /** Sum of profit on every sale. */
  income: number;
  /** Sum of each partner's divided half of the profit. */
  divided: number;
}

/**
 * The four summary cards. Deleted records (soft delete) are skipped.
 *
 * Units on an installment plan are NOT in inventory: their cost comes back to the fund
 * through the plan's capital-recovery fund-returns as payments arrive.
 */
export function computeSummary(records: readonly Transaction[]): Summary {
  let funds = 0;
  let fundReturns = 0;
  let remits = 0;
  let expenses = 0;
  let inventory = 0;
  let installmentValue = 0;
  let income = 0;
  let divided = 0;

  for (const r of records) {
    if (r.deleted) continue;
    switch (r.type) {
      case "fund":
        funds += r.amount;
        break;
      case "fund-return":
        fundReturns += r.amount;
        break;
      case "remit":
        remits += r.amount;
        break;
      case "expense":
        expenses += r.amount;
        break;
      case "unit":
        if (r.status === "in-stock") inventory += r.cost;
        else if (r.status === "installment") installmentValue += r.cost;
        break;
      case "income":
        income += r.profit;
        divided += r.dividedAmount;
        break;
      case "installment":
        break;
    }
  }

  return {
    fund: round2(funds + fundReturns - remits - expenses),
    inventory: round2(inventory),
    installmentValue: round2(installmentValue),
    income: round2(income),
    divided: round2(divided),
  };
}
