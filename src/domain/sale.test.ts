import { describe, expect, it } from "vitest";
import { planImmediateSale } from "./sale";
import { ctx, fakeIds, findUnit } from "./testFixture";

// TXN-162 is an in-stock Xiaomi laptop that cost 8,000.
const unit = findUnit("TXN-162");

describe("planImmediateSale with a profit", () => {
  const plan = planImmediateSale(unit, 9000, ctx);

  it("needs two transaction IDs", () => {
    expect(plan.ok && plan.idCount).toBe(2);
  });

  it("writes an income row and a fund-return of cost plus half the profit", () => {
    if (!plan.ok) throw new Error("expected a plan");
    const result = plan.build(fakeIds(2));
    expect(result.profit).toBe(1000);
    expect(result.create).toEqual([
      {
        type: "income",
        transactionId: "TXN-901",
        profit: 1000,
        dividedAmount: 500,
        unitId: unit.key,
        unitName: unit.name,
        date: ctx.today,
        createdBy: ctx.email,
        createdAt: ctx.now,
        timestamp: ctx.now,
      },
      {
        type: "fund-return",
        transactionId: "TXN-902",
        amount: 8500,
        unitId: unit.key,
        unitName: unit.name,
        date: ctx.today,
        createdBy: ctx.email,
        createdAt: ctx.now,
        timestamp: ctx.now,
      },
    ]);
  });

  it("marks the unit sold with who, when and for how much", () => {
    if (!plan.ok) throw new Error("expected a plan");
    expect(plan.build(fakeIds(2)).unitPatch).toEqual({
      key: unit.key,
      fields: { status: "sold", soldFor: 9000, soldDate: ctx.today, soldBy: ctx.email, soldAt: ctx.now },
    });
  });

  it("refuses to build with the wrong number of IDs", () => {
    if (!plan.ok) throw new Error("expected a plan");
    expect(() => plan.build(fakeIds(1))).toThrow();
  });
});

describe("planImmediateSale at cost or at a loss", () => {
  it("break-even: one fund-return of the sold price, no income row, with audit fields", () => {
    const plan = planImmediateSale(unit, 8000, ctx);
    if (!plan.ok) throw new Error("expected a plan");
    expect(plan.idCount).toBe(1);
    const [row, ...rest] = plan.build(fakeIds(1)).create;
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ type: "fund-return", amount: 8000, createdBy: ctx.email, createdAt: ctx.now });
  });

  it("loss: the fund gets back the sold price", () => {
    const plan = planImmediateSale(unit, 7000, ctx);
    if (!plan.ok) throw new Error("expected a plan");
    const result = plan.build(fakeIds(1));
    expect(result.profit).toBe(-1000);
    expect(result.create).toHaveLength(1);
    expect(result.create[0]).toMatchObject({ type: "fund-return", amount: 7000 });
  });
});

describe("planImmediateSale refusals (the real incidents)", () => {
  it("refuses a unit that is already sold: the iPad TXN-045 could not be sold twice", () => {
    const plan = planImmediateSale(findUnit("TXN-045"), 24000, ctx);
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.reason).toBe("already-sold");
  });

  it("refuses every unit that is on an installment plan", () => {
    const plan = planImmediateSale(findUnit("TXN-003"), 8000, ctx);
    expect(!plan.ok && plan.reason).toBe("on-installment");
  });

  it("refuses a deleted unit", () => {
    const plan = planImmediateSale({ ...unit, deleted: true }, 9000, ctx);
    expect(!plan.ok && plan.reason).toBe("unit-deleted");
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])("refuses the amount %s", (amount) => {
    const plan = planImmediateSale(unit, amount, ctx);
    expect(!plan.ok && plan.reason).toBe("invalid-amount");
  });
});
