import { describe, expect, it } from "vitest";
import raw from "../../tests/fixtures/scrubbed-transactions.json";
import { diffExports, reconcile } from "./reconcile";
import type { ExportFile } from "./reconcile";

const fixture = raw as unknown as ExportFile;
const clone = (): ExportFile => JSON.parse(JSON.stringify(fixture)) as ExportFile;
const firstKey = (f: ExportFile, pick: (r: Record<string, unknown>) => boolean): string => {
  const entries = Object.entries(f.transactions as Record<string, Record<string, unknown>>);
  const hit = entries.find(([, r]) => pick(r));
  if (!hit) throw new Error("no matching record");
  return hit[0];
};

describe("reconcile on the scrubbed 22 Oct export", () => {
  it("has no new problems and reproduces the golden figures", () => {
    const r = reconcile(fixture);
    expect(r.problems).toEqual([]);
    expect(r.parseErrors).toEqual([]);
    expect(r.summary).toEqual({ fund: 19310, inventory: 29000, installmentValue: 178700, income: 171500, divided: 85750 });
  });

  it("reports only the understood issues as known", () => {
    const codes = reconcile(fixture).known.map((k) => `${k.code}:${k.txn}`).sort();
    expect(codes.length).toBeGreaterThan(0);
    expect(codes).toContain("plan-negative-balance:TXN-085");
  });
});

describe("reconcile catches damage", () => {
  it("a counter behind the highest TXN number", () => {
    const f = clone();
    f.metadata = { transactionCounter: 5 };
    expect(reconcile(f).problems.map((p) => p.code)).toContain("counter-behind");
  });

  it("a plan whose cached totals disagree with the ledger", () => {
    const f = clone();
    const key = firstKey(f, (r) => r["type"] === "installment" && r["deleted"] !== true && r["transactionId"] !== "TXN-085");
    const rec = (f.transactions as Record<string, Record<string, number>>)[key]!;
    rec["capitalRecovered"] = (rec["capitalRecovered"] ?? 0) + 100;
    expect(reconcile(f).problems.map((p) => p.code)).toContain("plan-capital-mismatch");
  });

  it("a duplicate transaction number", () => {
    const f = clone();
    const entries = Object.values(f.transactions as Record<string, Record<string, unknown>>);
    entries[1]!["transactionId"] = entries[0]!["transactionId"];
    expect(reconcile(f).problems.map((p) => p.code)).toContain("duplicate-txn");
  });

  it("an in-stock unit that has sale rows", () => {
    const f = clone();
    const key = firstKey(f, (r) => r["type"] === "unit" && r["status"] === "sold" && r["installmentId"] === undefined && r["deleted"] !== true);
    (f.transactions as Record<string, Record<string, unknown>>)[key]!["status"] = "in-stock";
    expect(reconcile(f).problems.map((p) => p.code)).toContain("sold-rows-on-unit-not-sold");
  });

  it("a record the schema cannot read", () => {
    const f = clone();
    (f.transactions as Record<string, unknown>)["-Xbad"] = { type: "fund", amount: "lots" };
    expect(reconcile(f).parseErrors).toHaveLength(1);
  });
});

describe("diffExports", () => {
  it("lists added, changed and removed records", () => {
    const after = clone();
    const txs = after.transactions as Record<string, Record<string, unknown>>;
    const [k1, k2] = Object.keys(txs);
    txs["-Xnew"] = { type: "fund", transactionId: "TXN-900", amount: 5, date: "2026-10-23" };
    txs[k1!]!["editedBy"] = "someone";
    delete txs[k2!];
    const changes = diffExports(fixture, after);
    expect(changes.map((c) => c.kind).sort()).toEqual(["added", "changed", "removed"]);
    expect(changes.find((c) => c.kind === "changed")?.fields[0]).toContain("editedBy");
  });

  it("is empty for identical files", () => {
    expect(diffExports(fixture, clone())).toEqual([]);
  });
});
