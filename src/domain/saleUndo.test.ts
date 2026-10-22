import { describe, expect, it } from "vitest";
import { planRedoSale, planUndoSale } from "./saleUndo";
import type { SaleReversal } from "./saleUndo";
import type { FundReturn, TransactionRecord, UnitRecord } from "./schemas";
import { computeSummary } from "./summary";
import { ctx, records } from "./testFixture";

type KeyedFundReturn = FundReturn & { key: string };

/** An ordinary (non-installment) sold unit, with or without an income row. */
function soldUnit(withIncome: boolean): UnitRecord {
  const found = records.find((r): r is UnitRecord => {
    if (r.type !== "unit" || r.status !== "sold" || r.deleted || r.installmentId !== undefined) return false;
    const rows = records.filter(
      (x) => (x.type === "income" || x.type === "fund-return") && x.unitId === r.key && x.installmentId === undefined && !x.deleted,
    );
    const hasIncome = rows.some((x) => x.type === "income");
    const hasReturn = rows.some((x) => x.type === "fund-return");
    return hasReturn && hasIncome === withIncome;
  });
  if (!found) throw new Error(`fixture has no suitable sold unit (income: ${withIncome})`);
  return found;
}

function apply(all: TransactionRecord[], rev: SaleReversal): TransactionRecord[] {
  const patches = [rev.unitPatch, ...rev.ledgerPatches];
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

describe.each([
  ["profit sale", true],
  ["loss or break-even sale", false],
])("undo and redo a %s", (_name, withIncome) => {
  const unit = soldUnit(withIncome);

  it("undo moves the unit back to stock and takes the sale out of the summary", () => {
    const before = computeSummary(records);
    const planned = planUndoSale(unit, records, ctx);
    if (!planned.ok) throw new Error(planned.message);
    const rev = planned.build([]);
    expect(rev.unitPatch.fields).toMatchObject({ status: "in-stock", soldFor: null, soldDate: null });

    const after = computeSummary(apply(records, rev));
    expect(after.inventory).toBe(before.inventory + unit.cost);
    expect(after.fund).toBeLessThan(before.fund);
    if (withIncome) expect(after.income).toBeLessThan(before.income);
    else expect(after.income).toBe(before.income);
  });

  it("redo from the deleted fund-return restores the exact same summary and sold price", () => {
    const undo = planUndoSale(unit, records, ctx);
    if (!undo.ok) throw new Error(undo.message);
    const undone = apply(records, undo.build([]));
    const fr = undone.find(
      (r): r is KeyedFundReturn => r.type === "fund-return" && r.unitId === unit.key && r.deleted === true,
    );
    if (!fr) throw new Error("no deleted fund-return");
    const redo = planRedoSale(fr, undone.find((r) => r.key === unit.key) as UnitRecord, undone, ctx);
    if (!redo.ok) throw new Error(redo.message);
    const rev = redo.build([]);
    expect(rev.unitPatch.fields).toMatchObject({ status: "sold", soldFor: unit.soldFor });
    expect(computeSummary(apply(undone, rev))).toEqual(computeSummary(records));
  });
});

describe("refusals", () => {
  it("undo refuses units that are not sold, deleted, or sold through an installment plan", () => {
    const inStock = records.find((r): r is UnitRecord => r.type === "unit" && r.status === "in-stock" && !r.deleted);
    const viaPlan = records.find((r): r is UnitRecord => r.type === "unit" && r.status === "sold" && r.installmentId !== undefined);
    if (!inStock || !viaPlan) throw new Error("fixture units missing");
    expect(planUndoSale(inStock, records, ctx).ok).toBe(false);
    expect(planUndoSale({ ...soldUnit(true), deleted: true }, records, ctx).ok).toBe(false);
    const plan = planUndoSale(viaPlan, records, ctx);
    expect(!plan.ok && plan.reason).toBe("on-installment");
  });

  it("redo refuses a live row, a unit that was sold again, and a changed cost", () => {
    const unit = soldUnit(true);
    const undo = planUndoSale(unit, records, ctx);
    if (!undo.ok) throw new Error(undo.message);
    const undone = apply(records, undo.build([]));
    const fr = undone.find(
      (r): r is KeyedFundReturn => r.type === "fund-return" && r.unitId === unit.key && r.deleted === true,
    );
    if (!fr) throw new Error("no deleted fund-return");
    const inStock = undone.find((r) => r.key === unit.key) as UnitRecord;

    const live = planRedoSale({ ...fr, deleted: false }, inStock, undone, ctx);
    expect(!live.ok && live.reason).toBe("entry-not-deleted");
    const again = planRedoSale(fr, { ...inStock, status: "sold" }, undone, ctx);
    expect(!again.ok && again.reason).toBe("unit-not-in-stock");
    const edited = planRedoSale(fr, { ...inStock, cost: inStock.cost + 100 }, undone, ctx);
    expect(!edited.ok && edited.reason).toBe("invalid-input");
  });
});
