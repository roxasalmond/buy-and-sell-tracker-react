import { describe, expect, it } from "vitest";
import {
  ledgerRowCount,
  planCreateInstallment,
  planDeleteInstallment,
  planRecordPayment,
  planRestoreInstallment,
  splitPayment,
} from "./installment";
import type { PlanReversal } from "./installment";
import { computeSummary } from "./summary";
import { ctx, fakeIds, findPlan, findUnit, findUnitByKey, records } from "./testFixture";
import type { InstallmentRecord, TransactionRecord, UnitRecord } from "./schemas";

describe("splitPayment: cost first, then profit", () => {
  it("a payment below the unrecovered cost is all capital", () => {
    expect(splitPayment(5000, 0, 3000)).toEqual({ capital: 3000, profit: 0 });
  });
  it("a payment that crosses the cost line is split", () => {
    expect(splitPayment(5000, 3000, 3000)).toEqual({ capital: 2000, profit: 1000 });
  });
  it("once the cost is recovered, everything is profit", () => {
    expect(splitPayment(5000, 5000, 3000)).toEqual({ capital: 0, profit: 3000 });
  });
  it("counts ledger rows: capital 1, profit 2, none for nothing", () => {
    expect(ledgerRowCount({ capital: 3000, profit: 0 })).toBe(1);
    expect(ledgerRowCount({ capital: 0, profit: 3000 })).toBe(2);
    expect(ledgerRowCount({ capital: 2000, profit: 1000 })).toBe(3);
    expect(ledgerRowCount({ capital: 0, profit: 0 })).toBe(0);
  });
});

describe("splitPayment against every real plan in the 22 Oct export", () => {
  const plans = records.filter((r): r is InstallmentRecord => r.type === "installment");

  it("replaying each plan's payments reproduces its capitalRecovered and profitProcessed", () => {
    expect(plans).toHaveLength(48);
    for (const plan of plans) {
      let capital = 0;
      let profit = 0;
      for (const p of plan.paymentsMade) {
        const split = splitPayment(plan.originalCost, capital, p.amount);
        capital += split.capital;
        profit += split.profit;
      }
      expect({ id: plan.transactionId, capital, profit }).toEqual({
        id: plan.transactionId,
        capital: plan.capitalRecovered,
        profit: plan.profitProcessed,
      });
    }
  });

  it("matches the ledger: capital rows, income rows and profit fund-returns add up per plan", () => {
    for (const plan of plans) {
      let capitalRows = 0;
      let incomeRows = 0;
      let profitReturns = 0;
      for (const r of records) {
        if (r.type === "fund-return" && r.installmentId === plan.transactionId) {
          if (r.saleType === "installment-capital") capitalRows += r.amount;
          if (r.saleType === "installment-profit") profitReturns += r.amount;
        } else if (r.type === "income" && r.installmentId === plan.transactionId) {
          incomeRows += r.profit;
        }
      }
      expect({ id: plan.transactionId, capitalRows, incomeRows, profitReturns }).toEqual({
        id: plan.transactionId,
        capitalRows: plan.capitalRecovered,
        incomeRows: plan.profitProcessed,
        profitReturns: plan.profitProcessed / 2,
      });
    }
  });
});

const input = {
  buyerName: "  Buyer 99 ",
  totalPrice: 10000,
  downPayment: 2000,
  paymentFrequency: "weekly" as const,
  paymentAmount: 1000,
  nextDueDate: "2026-10-29",
};

describe("planCreateInstallment", () => {
  // TXN-162 is in stock and cost 8,000.
  const unit = findUnit("TXN-162");

  it("a down payment below the cost is all capital: the plan plus one fund-return", () => {
    const plan = planCreateInstallment(unit, input, ctx);
    if (!plan.ok) throw new Error("expected a plan");
    expect(plan.idCount).toBe(2);

    const result = plan.build(fakeIds(2));
    const [created, ...rows] = result.create;
    expect(created).toMatchObject({
      type: "installment",
      transactionId: "TXN-901",
      unitId: unit.key,
      buyerName: "Buyer 99",
      originalCost: 8000,
      totalPrice: 10000,
      downPayment: 2000,
      balanceRemaining: 8000,
      status: "active",
      capitalRecovered: 2000,
      profitProcessed: 0,
      paymentsMade: [{ amount: 2000, date: ctx.today, paidBy: ctx.email, paidAt: ctx.now }],
    });
    expect(rows).toEqual([
      {
        type: "fund-return",
        transactionId: "TXN-902",
        amount: 2000,
        saleType: "installment-capital",
        installmentId: "TXN-901",
        unitId: unit.key,
        unitName: unit.name,
        date: ctx.today,
        createdBy: ctx.email,
        createdAt: ctx.now,
        timestamp: ctx.now,
      },
    ]);
    expect(result.unitPatch).toEqual({
      key: unit.key,
      fields: { status: "installment", installmentId: "TXN-901" },
    });
  });

  it("a down payment above the cost writes capital, income and the profit fund-return", () => {
    const plan = planCreateInstallment(unit, { ...input, downPayment: 9000 }, ctx);
    if (!plan.ok) throw new Error("expected a plan");
    expect(plan.idCount).toBe(4);
    const [created, capital, income, profitReturn] = plan.build(fakeIds(4)).create;
    expect(created).toMatchObject({ capitalRecovered: 8000, profitProcessed: 1000, balanceRemaining: 1000 });
    expect(capital).toMatchObject({ type: "fund-return", amount: 8000, saleType: "installment-capital" });
    expect(income).toMatchObject({ type: "income", profit: 1000, dividedAmount: 500, saleType: "installment" });
    expect(profitReturn).toMatchObject({ type: "fund-return", amount: 500, saleType: "installment-profit" });
  });

  it("no down payment: only the plan, no zero-amount ledger rows", () => {
    const plan = planCreateInstallment(unit, { ...input, downPayment: 0 }, ctx);
    if (!plan.ok) throw new Error("expected a plan");
    expect(plan.idCount).toBe(1);
    const result = plan.build(fakeIds(1));
    expect(result.create).toHaveLength(1);
    expect(result.create[0]).toMatchObject({ paymentsMade: [{ amount: 0 }], capitalRecovered: 0 });
  });

  it("refuses a down payment that covers the whole price", () => {
    const plan = planCreateInstallment(unit, { ...input, downPayment: 10000 }, ctx);
    expect(!plan.ok && plan.reason).toBe("down-payment-covers-price");
  });

  it("refuses a missing buyer and bad numbers", () => {
    expect(!planCreateInstallment(unit, { ...input, buyerName: "  " }, ctx).ok).toBe(true);
    for (const bad of [{ totalPrice: 0 }, { downPayment: -1 }, { paymentAmount: 0 }]) {
      const plan = planCreateInstallment(unit, { ...input, ...bad }, ctx);
      expect(!plan.ok && plan.reason).toBe("invalid-input");
    }
  });

  it("refuses a unit that is sold, already on a plan, or deleted", () => {
    expect(!planCreateInstallment(findUnit("TXN-045"), input, ctx).ok).toBe(true);
    const sold = planCreateInstallment(findUnit("TXN-045"), input, ctx);
    const onPlan = planCreateInstallment(findUnit("TXN-003"), input, ctx);
    const deleted = planCreateInstallment({ ...unit, deleted: true }, input, ctx);
    expect(!sold.ok && sold.reason).toBe("unit-not-in-stock");
    expect(!onPlan.ok && onPlan.reason).toBe("unit-not-in-stock");
    expect(!deleted.ok && deleted.reason).toBe("unit-deleted");
  });
});

describe("planRecordPayment", () => {
  // Plan TXN-160 (Iphone 11): cost 7,000, 5,000 of it already recovered, total 10,000, balance 5,000.
  const plan = findPlan("TXN-160");
  const unit = findUnitByKey(plan.unitId);

  it("fixture precondition", () => {
    expect(plan).toMatchObject({ originalCost: 7000, capitalRecovered: 5000, totalPrice: 10000, balanceRemaining: 5000 });
    expect(unit?.status).toBe("installment");
  });

  it("a payment inside the unrecovered cost writes one capital fund-return", () => {
    const planned = planRecordPayment(plan, unit, 1000, ctx);
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.idCount).toBe(1);
    const result = planned.build(fakeIds(1));
    expect(result.completes).toBe(false);
    expect(result.create).toHaveLength(1);
    expect(result.create[0]).toMatchObject({
      type: "fund-return",
      amount: 1000,
      saleType: "installment-capital",
      installmentId: plan.transactionId,
      unitId: plan.unitId,
    });
    expect(result.installmentPatch.fields).toMatchObject({
      balanceRemaining: 4000,
      status: "active",
      lastPaymentDate: ctx.today,
      capitalRecovered: 6000,
      profitProcessed: plan.profitProcessed,
    });
    expect(result.installmentPatch.fields.totalPrice).toBeUndefined();
    expect(result.installmentPatch.fields.paymentsMade).toHaveLength(plan.paymentsMade.length + 1);
    expect(result.unitPatch).toBeUndefined();
  });

  it("a payment that crosses the cost line writes capital, income and profit fund-return", () => {
    const planned = planRecordPayment(plan, unit, 3000, ctx);
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.idCount).toBe(3);
    const result = planned.build(fakeIds(3));
    expect(result.split).toEqual({ capital: 2000, profit: 1000 });
    expect(result.create.map((r) => r.type)).toEqual(["fund-return", "income", "fund-return"]);
    expect(result.installmentPatch.fields).toMatchObject({ capitalRecovered: 7000, profitProcessed: plan.profitProcessed + 1000 });
  });

  it("the final payment completes the plan and moves the unit to Sold at the total price", () => {
    const planned = planRecordPayment(plan, unit, 5000, ctx);
    if (!planned.ok) throw new Error("expected a plan");
    const result = planned.build(fakeIds(planned.idCount));
    expect(result.completes).toBe(true);
    expect(result.installmentPatch.fields).toMatchObject({ balanceRemaining: 0, status: "completed" });
    expect(result.unitPatch).toEqual({
      key: plan.unitId,
      fields: {
        status: "sold",
        soldFor: 10000,
        soldDate: ctx.today,
        soldBy: ctx.email,
        soldAt: ctx.now,
        completedAt: ctx.now,
      },
    });
  });

  it("an overpayment is refused until confirmed (the TXN-085 case)", () => {
    const planned = planRecordPayment(plan, unit, 6000, ctx);
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.reason).toBe("overpayment-needs-confirmation");
    expect(planned.overpayment).toEqual({ extra: 1000, newTotalPrice: 11000 });
  });

  it("a confirmed overpayment raises the total price and the unit's sold price, and the extra is profit", () => {
    const planned = planRecordPayment(plan, unit, 6000, ctx, { confirmedOverpayment: true });
    if (!planned.ok) throw new Error("expected a plan");
    const result = planned.build(fakeIds(planned.idCount));
    expect(result.completes).toBe(true);
    expect(result.split).toEqual({ capital: 2000, profit: 4000 });
    expect(result.installmentPatch.fields).toMatchObject({ totalPrice: 11000, balanceRemaining: 0, status: "completed" });
    expect(result.unitPatch?.fields.soldFor).toBe(11000);
  });

  it("refuses a payment on a completed plan (TXN-085)", () => {
    const planned = planRecordPayment(findPlan("TXN-085"), undefined, 1000, ctx);
    expect(!planned.ok && planned.reason).toBe("plan-completed");
  });

  it("refuses a payment on a deleted plan (TXN-538)", () => {
    const planned = planRecordPayment(findPlan("TXN-538"), undefined, 1000, ctx);
    expect(!planned.ok && planned.reason).toBe("plan-deleted");
  });

  it.each([0, -1, Number.NaN])("refuses the amount %s", (amount) => {
    const planned = planRecordPayment(plan, unit, amount, ctx);
    expect(!planned.ok && planned.reason).toBe("invalid-amount");
  });

  it("refuses a finishing payment when the unit no longer exists", () => {
    const planned = planRecordPayment(plan, undefined, 5000, ctx);
    expect(!planned.ok && planned.reason).toBe("unit-missing");
  });

  it("a non-finishing payment does not need the unit", () => {
    expect(planRecordPayment(plan, undefined, 1000, ctx).ok).toBe(true);
  });

  it("leaves a unit that is already sold alone instead of selling it twice", () => {
    if (!unit) throw new Error("unit missing");
    const planned = planRecordPayment(plan, { ...unit, status: "sold" }, 5000, ctx);
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.build(fakeIds(planned.idCount)).unitPatch).toBeUndefined();
  });
});

describe("delete and restore an installment plan", () => {
  const unit = findUnit("TXN-162");
  const input = {
    buyerName: "Test Buyer",
    totalPrice: 10000,
    downPayment: 9000,
    paymentFrequency: "weekly" as const,
    paymentAmount: 500,
    nextDueDate: "2026-11-01",
  };

  /** Apply a plan's rows and patches to a copy of the records, like Firebase would. */
  function withPlan() {
    const planned = planCreateInstallment(unit, input, ctx);
    if (!planned.ok) throw new Error("expected a plan");
    const result = planned.build(fakeIds(planned.idCount));
    const created = result.create.map((r, i) => ({ ...r, key: `new-${i}` }) as TransactionRecord);
    const patched = records.map((r) =>
      r.key === unit.key ? ({ ...r, ...result.unitPatch.fields } as TransactionRecord) : r,
    );
    return { all: [...patched, ...created], plan: created[0] as InstallmentRecord };
  }

  function apply(all: TransactionRecord[], rev: PlanReversal): TransactionRecord[] {
    const patches = [rev.planPatch, ...rev.ledgerPatches, ...(rev.unitPatch ? [rev.unitPatch] : [])];
    return all.map((r) => {
      const p = patches.find((x) => x.key === r.key);
      if (!p) return r;
      const next: Record<string, unknown> = { ...r };
      for (const [k, v] of Object.entries(p.fields)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      return next as TransactionRecord;
    });
  }

  it("delete takes the summary back to what it was before the plan", () => {
    const before = computeSummary(records);
    const { all, plan } = withPlan();
    const during = computeSummary(all);
    expect(during.income).not.toBe(before.income);

    const planned = planDeleteInstallment(plan, all, all.find((r) => r.key === unit.key) as UnitRecord, ctx);
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.idCount).toBe(0);
    const rev = planned.build([]);
    expect(rev.ledgerPatches).toHaveLength(3);
    expect(rev.unitPatch?.fields).toMatchObject({ status: "in-stock", installmentId: null, soldFor: null });

    const after = computeSummary(apply(all, rev));
    expect(after).toEqual(before);
  });

  it("restore brings the plan back and returns the unit to the plan", () => {
    const { all, plan } = withPlan();
    const del = planDeleteInstallment(plan, all, all.find((r) => r.key === unit.key) as UnitRecord, ctx);
    if (!del.ok) throw new Error("expected a plan");
    const deleted = apply(all, del.build([]));

    const deletedPlan = deleted.find((r) => r.key === plan.key) as InstallmentRecord;
    const deletedUnit = deleted.find((r) => r.key === unit.key) as UnitRecord;
    const res = planRestoreInstallment(deletedPlan, deleted, deletedUnit, ctx);
    if (!res.ok) throw new Error("expected a plan");
    const restored = apply(deleted, res.build([]));
    expect(computeSummary(restored)).toEqual(computeSummary(all));
    expect(restored.find((r) => r.key === unit.key)).toMatchObject({ status: "installment" });
  });

  it("refuses to delete twice, restore a live plan, or restore onto a unit that is no longer in stock", () => {
    const { all, plan } = withPlan();
    const u = all.find((r) => r.key === unit.key) as UnitRecord;
    const del = planDeleteInstallment(plan, all, u, ctx);
    if (!del.ok) throw new Error("expected a plan");
    const deleted = apply(all, del.build([]));
    const deletedPlan = deleted.find((r) => r.key === plan.key) as InstallmentRecord;

    const again = planDeleteInstallment(deletedPlan, deleted, u, ctx);
    expect(!again.ok && again.reason).toBe("plan-deleted");
    const live = planRestoreInstallment(plan, all, u, ctx);
    expect(!live.ok && live.reason).toBe("entry-not-deleted");
    const sold = planRestoreInstallment(deletedPlan, deleted, { ...u, status: "sold" }, ctx);
    expect(!sold.ok && sold.reason).toBe("unit-not-in-stock");
  });
});
