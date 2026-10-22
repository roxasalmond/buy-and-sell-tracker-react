import { describe, expect, it } from "vitest";
import { computeSummary } from "./summary";
import { planAddUnit } from "./unitEntry";
import type { AddUnitInput } from "./unitEntry";
import { ctx, fakeIds, records } from "./testFixture";

const input: AddUnitInput = {
  name: "  Samsung A15 ",
  category: "Android",
  condition: "Second Hand",
  imei: " 356938035643809 ",
  date: "2026-10-22",
  cost: 4500,
  suggestedPrice: 6000,
  photoURL: "https://res.cloudinary.com/x/image/upload/a.jpg",
};

function build(i: AddUnitInput) {
  const plan = planAddUnit(i, "unitKey1", ctx);
  if (!plan.ok) throw new Error(plan.message);
  expect(plan.idCount).toBe(2);
  return plan.build(fakeIds(2));
}

describe("planAddUnit", () => {
  it("writes the unit in stock and a purchase expense that points at it", () => {
    const { unit, expense } = build(input);
    expect(unit).toEqual({
      type: "unit",
      transactionId: "TXN-901",
      name: "Samsung A15",
      category: "Android",
      imei: "356938035643809",
      condition: "Second Hand",
      date: "2026-10-22",
      cost: 4500,
      suggestedPrice: 6000,
      photoURL: input.photoURL,
      status: "in-stock",
      createdBy: ctx.email,
      createdAt: ctx.now,
      timestamp: ctx.now,
    });
    expect(expense).toEqual({
      type: "expense",
      transactionId: "TXN-902",
      unitId: "unitKey1",
      date: "2026-10-22",
      amount: 4500,
      reason: "Unit purchase: Samsung A15",
      createdBy: ctx.email,
      createdAt: ctx.now,
      timestamp: ctx.now,
    });
  });

  it("a laptop has no IMEI", () => {
    const { unit } = build({ ...input, category: "Laptop", imei: "ignored" });
    expect(unit.imei).toBe("");
  });

  it("raises inventory by the cost and lowers the fund by the cost", () => {
    const before = computeSummary(records);
    const { unit, expense } = build(input);
    const after = computeSummary([...records, { ...unit, key: "unitKey1" }, { ...expense, key: "e1" }]);
    expect(after.inventory).toBe(before.inventory + 4500);
    expect(after.fund).toBe(before.fund - 4500);
    expect(after.income).toBe(before.income);
  });

  it("refuses bad input", () => {
    const bad: Partial<AddUnitInput>[] = [
      { name: "  " },
      { category: "" },
      { condition: "Broken" },
      { imei: " " },
      { date: "2026-13-40" },
      { cost: 0 },
      { suggestedPrice: -1 },
      { photoURL: "" },
    ];
    for (const b of bad) {
      expect(planAddUnit({ ...input, ...b }, "k", ctx).ok).toBe(false);
    }
  });
});
