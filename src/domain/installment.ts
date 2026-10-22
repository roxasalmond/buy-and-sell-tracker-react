/**
 * Installment plans.
 *
 * Every payment first recovers the unit's cost (fund-return, saleType
 * "installment-capital"). Whatever is left of the payment is profit: an income row
 * (divided = profit / 2) plus a fund-return of that half ("installment-profit").
 * A payment that does not produce capital or profit writes no row.
 */
import { round2 } from "../lib/money";
import { idPicker, refuse } from "./plan";
import type { Patch, PlanResult, WriteContext } from "./plan";
import type { FundReturn, Income, Installment, InstallmentRecord, Unit, UnitRecord } from "./schemas";
import { effectiveStatus, startInstallmentRefusal } from "./unitStatus";

// ---------------------------------------------------------------------------
// The split (this is the rule; everything else calls it)
// ---------------------------------------------------------------------------

export interface PaymentSplit {
  capital: number;
  profit: number;
}

/** Split one payment into cost recovery and profit. */
export function splitPayment(originalCost: number, capitalRecovered: number, amount: number): PaymentSplit {
  const capitalRemaining = Math.max(0, originalCost - capitalRecovered);
  const capital = round2(Math.min(amount, capitalRemaining));
  const profit = round2(amount - capital);
  return { capital, profit };
}

/** Number of ledger rows (= transaction IDs) a payment needs. */
export function ledgerRowCount(split: PaymentSplit): number {
  return (split.capital > 0 ? 1 : 0) + (split.profit > 0 ? 2 : 0);
}

interface PlanLink {
  unitKey: string;
  unitName: string;
  planTransactionId: string;
}

/** Capital fund-return, then income, then the fund-return for half the profit. */
function buildPaymentLedger(
  link: PlanLink,
  split: PaymentSplit,
  nextId: () => string,
  ctx: WriteContext,
): (Income | FundReturn)[] {
  const common = {
    unitId: link.unitKey,
    unitName: link.unitName,
    installmentId: link.planTransactionId,
    date: ctx.today,
    createdBy: ctx.email,
    createdAt: ctx.now,
    timestamp: ctx.now,
  };

  const rows: (Income | FundReturn)[] = [];
  if (split.capital > 0) {
    rows.push({
      type: "fund-return",
      transactionId: nextId(),
      amount: split.capital,
      saleType: "installment-capital",
      ...common,
    });
  }
  if (split.profit > 0) {
    const half = split.profit / 2;
    rows.push({
      type: "income",
      transactionId: nextId(),
      profit: split.profit,
      dividedAmount: half,
      saleType: "installment",
      ...common,
    });
    rows.push({
      type: "fund-return",
      transactionId: nextId(),
      amount: half,
      saleType: "installment-profit",
      ...common,
    });
  }
  return rows;
}

function sequence(pick: (index: number) => string, start: number): () => string {
  let index = start;
  return () => pick(index++);
}

// ---------------------------------------------------------------------------
// Create a plan
// ---------------------------------------------------------------------------

export interface CreateInstallmentInput {
  buyerName: string;
  totalPrice: number;
  downPayment: number;
  paymentFrequency: "weekly" | "monthly";
  paymentAmount: number;
  nextDueDate: string;
}

export interface CreateInstallmentResult {
  /** The plan and its ledger rows, with transaction IDs filled in. */
  create: (Installment | Income | FundReturn)[];
  /** The unit moves to "installment" and is linked to the plan. */
  unitPatch: Patch<Unit>;
}

export function planCreateInstallment(
  unit: UnitRecord,
  input: CreateInstallmentInput,
  ctx: WriteContext,
): PlanResult<CreateInstallmentResult> {
  const buyerName = input.buyerName.trim();
  if (!buyerName) return refuse("invalid-input", "Please choose a unit and enter the buyer name.");
  if (!(input.totalPrice > 0) || !(input.downPayment >= 0) || !(input.paymentAmount > 0)) {
    return refuse("invalid-input", "Please check the price, down payment and payment amount.");
  }
  if (input.downPayment >= input.totalPrice) {
    return refuse(
      "down-payment-covers-price",
      "The down payment covers the full price. Use the Sell button in the Units tab for a full-payment sale.",
    );
  }
  const refusal = startInstallmentRefusal(unit);
  if (refusal) return refusal;

  // The down payment is split exactly like any other payment.
  const split = splitPayment(unit.cost, 0, input.downPayment);
  const idCount = 1 + ledgerRowCount(split);

  return {
    ok: true,
    idCount,
    build(ids) {
      const pick = idPicker(ids, idCount);
      const planId = pick(0);

      const plan: Installment = {
        type: "installment",
        transactionId: planId,
        unitId: unit.key,
        unitName: unit.name,
        buyerName,
        totalPrice: input.totalPrice,
        originalCost: unit.cost,
        downPayment: input.downPayment,
        paymentFrequency: input.paymentFrequency,
        paymentAmount: input.paymentAmount,
        // Always one entry, even for a 0 down payment: keeps the record shape of the old app.
        paymentsMade: [{ amount: input.downPayment, date: ctx.today, paidBy: ctx.email, paidAt: ctx.now }],
        balanceRemaining: round2(input.totalPrice - input.downPayment),
        nextDueDate: input.nextDueDate,
        status: "active",
        capitalRecovered: split.capital,
        profitProcessed: split.profit,
        createdBy: ctx.email,
        createdAt: ctx.now,
        timestamp: ctx.now,
      };

      const rows = buildPaymentLedger(
        { unitKey: unit.key, unitName: unit.name, planTransactionId: planId },
        split,
        sequence(pick, 1),
        ctx,
      );

      return {
        create: [plan, ...rows],
        unitPatch: { key: unit.key, fields: { status: "installment", installmentId: planId } },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Record a payment
// ---------------------------------------------------------------------------

export interface PaymentResult {
  split: PaymentSplit;
  /** True when this payment clears the balance and completes the plan. */
  completes: boolean;
  create: (Income | FundReturn)[];
  installmentPatch: Patch<Installment>;
  /** Present when the plan completes and the unit still has to move to Sold. */
  unitPatch?: Patch<Unit>;
}

export interface PaymentOptions {
  /**
   * The user confirmed that a payment above the balance should raise the total price.
   * Without it, an overpayment is refused with reason "overpayment-needs-confirmation".
   */
  confirmedOverpayment?: boolean;
}

export function planRecordPayment(
  plan: InstallmentRecord,
  unit: UnitRecord | undefined,
  amount: number,
  ctx: WriteContext,
  options: PaymentOptions = {},
): PlanResult<PaymentResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return refuse("invalid-amount", "Please enter a valid payment amount.");
  }
  if (plan.deleted) return refuse("plan-deleted", "This installment was deleted.");
  if (plan.status === "completed" || plan.balanceRemaining <= 0) {
    return refuse("plan-completed", "This installment is already fully paid. Nothing was recorded.");
  }

  const balance = plan.balanceRemaining;
  const extra = round2(amount - balance);
  let totalPrice = plan.totalPrice;
  if (extra > 0) {
    const newTotalPrice = round2(plan.totalPrice + extra);
    if (!options.confirmedOverpayment) {
      return {
        ...refuse(
          "overpayment-needs-confirmation",
          `This payment (₱${amount.toFixed(2)}) is ₱${extra.toFixed(2)} more than the remaining balance (₱${balance.toFixed(2)}).\n\n` +
            `Record it anyway and raise the total price from ₱${plan.totalPrice.toFixed(2)} to ₱${newTotalPrice.toFixed(2)}?\n` +
            `The extra ₱${extra.toFixed(2)} will count as profit.`,
        ),
        overpayment: { extra, newTotalPrice },
      };
    }
    totalPrice = newTotalPrice;
  }

  const newBalance = round2(Math.max(0, balance - amount));
  const completes = newBalance <= 0;

  // A finishing payment must be able to move the unit to Sold, so the unit has to exist.
  if (completes && !unit) {
    return refuse(
      "unit-missing",
      "The unit for this plan no longer exists, so the payment was not recorded. Please check Firebase.",
    );
  }

  const split = splitPayment(plan.originalCost, plan.capitalRecovered, amount);
  const idCount = ledgerRowCount(split);
  // A unit that is already sold (old plans finished before the completion step existed)
  // is left alone instead of being sold a second time.
  const moveUnitToSold = completes && unit !== undefined && effectiveStatus(unit) !== "sold";

  return {
    ok: true,
    idCount,
    build(ids) {
      const pick = idPicker(ids, idCount);

      const create = buildPaymentLedger(
        { unitKey: plan.unitId, unitName: plan.unitName, planTransactionId: plan.transactionId },
        split,
        sequence(pick, 0),
        ctx,
      );

      const fields: Partial<Installment> = {
        paymentsMade: [...plan.paymentsMade, { amount, date: ctx.today, paidBy: ctx.email, paidAt: ctx.now }],
        balanceRemaining: newBalance,
        status: completes ? "completed" : "active",
        lastPaymentDate: ctx.today,
        capitalRecovered: round2(plan.capitalRecovered + split.capital),
        profitProcessed: round2(plan.profitProcessed + split.profit),
      };
      if (totalPrice !== plan.totalPrice) fields.totalPrice = totalPrice;

      const result: PaymentResult = {
        split,
        completes,
        create,
        installmentPatch: { key: plan.key, fields },
      };

      if (moveUnitToSold) {
        result.unitPatch = {
          key: plan.unitId,
          fields: {
            status: "sold",
            soldFor: totalPrice,
            soldDate: ctx.today,
            soldBy: ctx.email,
            soldAt: ctx.now,
            completedAt: ctx.now,
          },
        };
      }
      return result;
    },
  };
}
