import { describe, expect, it } from "vitest";
import { computeSummary } from "./summary";
import { planDeleteUnit, planEditUnit, planRestoreUnit } from "./unitChanges";
import type { EditUnitInput, UnitReversal } from "./unitChanges";
import type { TransactionRecord, UnitRecord } from "./schemas";
import { ctx, findUnit, records } from "./testFixture";

// TXN-162 is in stock and cost 8,000 (see the installment tests).
const unit = findUnit("TXN-162");

function editInput(over: Partial<EditUnitInput> = {}): EditUnitInput {
  return {
    name: unit.name,
    category: unit.category,
    condition: unit.condition,
    imei: unit.imei,
    date: unit.date,
    cost: unit.cost,
    suggestedPrice: unit.suggestedPrice ?? 1,
    ...over,
  };
}

function apply(all: TransactionRecord[], rev: UnitReversal): TransactionRecord[] {
  const patches = [rev.unitPatch, ...rev.expensePatches];
  return all.map((r) => {
    const p = patches.find((x) => x.key === r.key);
    return p ? ({ ...r, ...p.fields } as TransactionRecord) : r;
  });
}

describe("planEditUnit", () => {
  it("fixture precondition: one live purchase expense whose amount is the cost", () => {
    const e = records.filter((r) => r.type === "expense" && r.unitId === unit.key);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ amount: unit.cost });
  });

  it("a rename changes only the unit and the standard expense wording", () => {
    const planned = planEditUnit(unit, records, editInput({ name: "Renamed phone" }), ctx);
    if (!planned.ok) throw new Error(planned.message);
    const r = planned.build([]);
    expect(r.unitPatch.fields).toMatchObject({ name: "Renamed phone", editedBy: ctx.email, editedAt: ctx.now });
    expect(r.expensePatch?.fields).toMatchObject({ reason: "Unit purchase: Renamed phone" });
    expect(r.expensePatch?.fields.amount).toBeUndefined();
  });

  it("a new cost is written to the expense so fund and inventory stay in step", () => {
    const planned = planEditUnit(unit, records, editInput({ cost: unit.cost + 500 }), ctx);
    if (!planned.ok) throw new Error(planned.message);
    const r = planned.build([]);
    expect(r.expensePatch?.fields).toMatchObject({ amount: unit.cost + 500 });

    const before = computeSummary(records);
    const exp = r.expensePatch;
    const after = computeSummary(
      records.map((x) =>
        x.key === unit.key
          ? ({ ...x, ...r.unitPatch.fields } as TransactionRecord)
          : exp && x.key === exp.key
            ? ({ ...x, ...exp.fields } as TransactionRecord)
            : x,
      ),
    );
    expect(after.inventory).toBe(before.inventory + 500);
    expect(after.fund).toBe(before.fund - 500);
  });

  it("clears the IMEI when a phone is changed to a laptop", () => {
    const phone = records.find(
      (r): r is UnitRecord =>
        r.type === "unit" && r.status === "in-stock" && !r.deleted && r.category !== "Laptop",
    );
    if (!phone) throw new Error("fixture has no in-stock phone");
    const planned = planEditUnit(
      phone,
      records,
      editInput({
        name: phone.name,
        category: "Laptop",
        condition: phone.condition,
        imei: "ignored",
        date: phone.date,
        cost: phone.cost,
        suggestedPrice: phone.suggestedPrice ?? 1,
      }),
      ctx,
    );
    if (!planned.ok) throw new Error(planned.message);
    expect(planned.build([]).unitPatch.fields).toMatchObject({ category: "Laptop", imei: "" });
  });

  it("refuses no change, bad input and a deleted unit", () => {
    expect(planEditUnit(unit, records, editInput(), ctx).ok).toBe(false);
    expect(planEditUnit(unit, records, editInput({ cost: 0 }), ctx).ok).toBe(false);
    expect(planEditUnit(unit, records, editInput({ name: " " }), ctx).ok).toBe(false);
    const deleted = planEditUnit({ ...unit, deleted: true }, records, editInput({ name: "x" }), ctx);
    expect(!deleted.ok && deleted.reason).toBe("unit-deleted");
  });

  it("a new photo is saved with its upload time; the same photo counts as no change", () => {
    const withPhoto = planEditUnit(unit, records, editInput({ photoURL: "https://example.com/new.jpg" }), ctx);
    if (!withPhoto.ok) throw new Error(withPhoto.message);
    expect(withPhoto.build([]).unitPatch.fields).toMatchObject({
      photoURL: "https://example.com/new.jpg",
      photoUploadedAt: ctx.now,
    });
    if (unit.photoURL) {
      expect(planEditUnit(unit, records, editInput({ photoURL: unit.photoURL }), ctx).ok).toBe(false);
    }
  });

  describe("sold units: descriptive fields only", () => {
    const sold = findUnit("TXN-045");
    const soldInput = (over: Partial<EditUnitInput> = {}): EditUnitInput => ({
      name: sold.name,
      category: sold.category,
      condition: sold.condition,
      imei: sold.imei,
      date: sold.date,
      cost: sold.cost,
      suggestedPrice: sold.suggestedPrice ?? 1,
      ...over,
    });

    it("refuses a new cost and points at undoing the sale", () => {
      const planned = planEditUnit(sold, records, soldInput({ cost: sold.cost + 1 }), ctx);
      expect(!planned.ok && planned.reason).toBe("already-sold");
    });

    it("a rename renames the unit on its plan and sale rows too, and writes no money fields", () => {
      const planned = planEditUnit(sold, records, soldInput({ name: "Renamed iPad" }), ctx);
      if (!planned.ok) throw new Error(planned.message);
      const r = planned.build([]);
      expect(r.unitPatch.fields).toMatchObject({ name: "Renamed iPad", cost: sold.cost });
      expect(r.unitPatch.fields.soldFor).toBeUndefined();
      expect(r.nameDisplayPatches.length).toBeGreaterThan(0);
      for (const p of r.nameDisplayPatches) expect(p.fields).toEqual({ unitName: "Renamed iPad" });
    });
  });
});

describe("planDeleteUnit and planRestoreUnit", () => {
  it("delete puts the purchase money back in the fund and removes the unit from inventory", () => {
    const before = computeSummary(records);
    const planned = planDeleteUnit(unit, records, ctx);
    if (!planned.ok) throw new Error(planned.message);
    const rev = planned.build([]);
    expect(rev.expensePatches).toHaveLength(1);
    const after = computeSummary(apply(records, rev));
    expect(after.inventory).toBe(before.inventory - unit.cost);
    expect(after.fund).toBe(before.fund + unit.cost);
    expect(after.income).toBe(before.income);
  });

  it("restore brings both back and the summary returns to what it was", () => {
    const planned = planDeleteUnit(unit, records, ctx);
    if (!planned.ok) throw new Error(planned.message);
    const deleted = apply(records, planned.build([]));
    const deletedUnit = deleted.find((r) => r.key === unit.key) as UnitRecord;
    const res = planRestoreUnit(deletedUnit, deleted, ctx);
    if (!res.ok) throw new Error(res.message);
    expect(computeSummary(apply(deleted, res.build([])))).toEqual(computeSummary(records));
  });

  it("restore leaves an expense that was deleted separately earlier", () => {
    const planned = planDeleteUnit(unit, records, ctx);
    if (!planned.ok) throw new Error(planned.message);
    const rev = planned.build([]);
    const deleted = apply(records, rev).map((r) =>
      r.type === "expense" && r.unitId === unit.key ? ({ ...r, deletedAt: 1 } as TransactionRecord) : r,
    );
    const res = planRestoreUnit(deleted.find((r) => r.key === unit.key) as UnitRecord, deleted, ctx);
    if (!res.ok) throw new Error(res.message);
    expect(res.build([]).expensePatches).toHaveLength(0);
  });

  it("refuses sold units, units on a plan, double delete and restoring a live unit", () => {
    const sold = planDeleteUnit(findUnit("TXN-045"), records, ctx);
    expect(!sold.ok && sold.reason).toBe("already-sold");
    const onPlan = planDeleteUnit(findUnit("TXN-003"), records, ctx);
    expect(!onPlan.ok && onPlan.reason).toBe("on-installment");
    const twice = planDeleteUnit({ ...unit, deleted: true }, records, ctx);
    expect(!twice.ok && twice.reason).toBe("unit-deleted");
    const live = planRestoreUnit(unit, records, ctx);
    expect(!live.ok && live.reason).toBe("entry-not-deleted");
  });
});
