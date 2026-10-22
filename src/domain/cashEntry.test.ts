import { describe, expect, it } from "vitest";
import { isValidDateString, planAddFund, planAddRemit } from "./cashEntry";
import { computeSummary } from "./summary";
import { ctx, records } from "./testFixture";

describe("date check", () => {
  it("accepts real dates only", () => {
    expect(isValidDateString("2026-10-22")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("22/10/2026")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });
});

describe("add fund", () => {
  it("builds one fund row in the live app's shape", () => {
    const plan = planAddFund(1500.5, "2026-10-22", ctx);
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.idCount).toBe(1);
    expect(plan.build(["TXN-611"]).create).toEqual([
      {
        type: "fund",
        transactionId: "TXN-611",
        date: "2026-10-22",
        amount: 1500.5,
        createdBy: ctx.email,
        createdAt: ctx.now,
        timestamp: ctx.now,
      },
    ]);
  });

  it("raises the fund card by exactly the amount", () => {
    const plan = planAddFund(1000, "2026-10-22", ctx);
    if (!plan.ok) throw new Error("expected ok");
    const row = plan.build(["TXN-611"]).create[0];
    const before = computeSummary(records);
    const after = computeSummary([...records, { ...row, key: "new" }]);
    expect(after.fund).toBeCloseTo(before.fund + 1000, 2);
    expect(after.income).toBe(before.income);
    expect(after.inventory).toBe(before.inventory);
  });

  it("refuses zero, negative, NaN and bad dates", () => {
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = planAddFund(amount, "2026-10-22", ctx);
      expect(r.ok === false && r.reason).toBe("invalid-amount");
    }
    const bad = planAddFund(10, "2026-13-01", ctx);
    expect(bad.ok === false && bad.reason).toBe("invalid-input");
  });

  it("fails loudly when the wrong number of ids is given", () => {
    const plan = planAddFund(10, "2026-10-22", ctx);
    if (!plan.ok) throw new Error("expected ok");
    expect(() => plan.build([])).toThrow();
  });
});

describe("add remit", () => {
  it("lowers the fund card and accepts a future date (remit in advance)", () => {
    const plan = planAddRemit(2000, "2026-12-31", ctx);
    if (!plan.ok) throw new Error("expected ok");
    const row = plan.build(["TXN-611"]).create[0];
    expect(row.type).toBe("remit");
    const before = computeSummary(records);
    const after = computeSummary([...records, { ...row, key: "new" }]);
    expect(after.fund).toBeCloseTo(before.fund - 2000, 2);
  });

  it("refuses an invalid amount", () => {
    const r = planAddRemit(0, "2026-10-22", ctx);
    expect(r.ok === false && r.reason).toBe("invalid-amount");
  });
});
