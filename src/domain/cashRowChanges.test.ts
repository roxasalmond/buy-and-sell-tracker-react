import { describe, expect, it } from "vitest";
import { planDeleteCashRow, planEditCashRow, planRestoreCashRow } from "./cashRowChanges";
import type { CashRow } from "./cashRowChanges";
import { computeSummary } from "./summary";
import { ctx, records } from "./testFixture";

function pick(type: "fund" | "remit"): CashRow {
  const row = records.find((r): r is CashRow => r.type === type && r.deleted !== true);
  if (!row) throw new Error(`no ${type} in fixture`);
  return row;
}

/** The fixture has no deleted funds or remits, so make one from a live row. */
function deletedCopy(row: CashRow): CashRow {
  return { ...row, deleted: true, deletedBy: "x@example.com", deletedAt: 1 };
}

/** Apply a patch to the record list the way Firebase would, then recompute the cards. */
function applyPatch(row: CashRow, fields: Record<string, unknown>) {
  const next = records.map((r) => (r.key === row.key ? ({ ...r, ...fields } as typeof r) : r));
  return computeSummary(next);
}

describe("edit", () => {
  it("writes only amount, date and the audit fields, and moves the fund by the difference", () => {
    const row = pick("fund");
    const plan = planEditCashRow(row, { amount: row.amount + 250, date: "2026-10-01" }, ctx);
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.idCount).toBe(0);
    const { patch } = plan.build([]);
    expect(patch.key).toBe(row.key);
    expect(Object.keys(patch.fields).sort()).toEqual(["amount", "date", "editedAt", "editedBy"]);
    expect(patch.fields.editedBy).toBe(ctx.email);

    const before = computeSummary(records);
    const after = applyPatch(row, patch.fields);
    expect(after.fund).toBeCloseTo(before.fund + 250, 2);
    expect(after.income).toBe(before.income);
    expect(after.inventory).toBe(before.inventory);
  });

  it("a remit edit moves the fund the other way", () => {
    const row = pick("remit");
    const plan = planEditCashRow(row, { amount: row.amount + 100, date: row.date }, ctx);
    if (!plan.ok) throw new Error("expected ok");
    const after = applyPatch(row, plan.build([]).patch.fields);
    expect(after.fund).toBeCloseTo(computeSummary(records).fund - 100, 2);
  });

  it("refuses a deleted row, bad input and no change", () => {
    const live = pick("fund");
    const gone = deletedCopy(live);
    const deleted = planEditCashRow(gone, { amount: 10, date: "2026-10-01" }, ctx);
    expect(deleted.ok === false && deleted.reason).toBe("entry-deleted");
    const zero = planEditCashRow(live, { amount: 0, date: live.date }, ctx);
    expect(zero.ok === false && zero.reason).toBe("invalid-amount");
    const date = planEditCashRow(live, { amount: 10, date: "2026-02-31" }, ctx);
    expect(date.ok === false && date.reason).toBe("invalid-input");
    const same = planEditCashRow(live, { amount: live.amount, date: live.date }, ctx);
    expect(same.ok === false && same.message).toBe("Nothing was changed");
  });
});

describe("delete and restore", () => {
  it("delete soft-deletes and takes the amount out of the fund; restore puts it back", () => {
    const row = pick("fund");
    const del = planDeleteCashRow(row, ctx);
    if (!del.ok) throw new Error("expected ok");
    const { patch } = del.build([]);
    expect(patch.fields).toEqual({ deleted: true, deletedBy: ctx.email, deletedAt: ctx.now });

    const before = computeSummary(records);
    const gone = applyPatch(row, patch.fields);
    expect(gone.fund).toBeCloseTo(before.fund - row.amount, 2);

    const deletedRow = { ...row, ...patch.fields } as CashRow;
    const res = planRestoreCashRow(deletedRow, ctx);
    if (!res.ok) throw new Error("expected ok");
    expect(res.build([]).patch.fields).toEqual({ deleted: false, restoredBy: ctx.email, restoredAt: ctx.now });
  });

  it("refuses to delete twice or restore a live row", () => {
    const live = pick("remit");
    const gone = deletedCopy(pick("remit"));
    const again = planDeleteCashRow(gone, ctx);
    expect(again.ok === false && again.reason).toBe("entry-deleted");
    const notDeleted = planRestoreCashRow(live, ctx);
    expect(notDeleted.ok === false && notDeleted.reason).toBe("entry-not-deleted");
  });
});
