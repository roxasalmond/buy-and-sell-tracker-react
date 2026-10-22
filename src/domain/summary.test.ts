import { describe, expect, it } from "vitest";
import raw from "../../tests/fixtures/scrubbed-transactions.json";
import { parseTransactions } from "./schemas";
import type { Transaction } from "./schemas";
import { computeSummary } from "./summary";

const parsed = parseTransactions(raw.transactions);

describe("scrubbed 22 Oct 2026 export", () => {
  it("parses every record with no schema errors", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.records).toHaveLength(585);
  });

  it("has the expected number of each record type", () => {
    const counts: Record<string, number> = {};
    for (const r of parsed.records) counts[r.type] = (counts[r.type] ?? 0) + 1;
    expect(counts).toEqual({
      unit: 108,
      expense: 108,
      fund: 5,
      remit: 12,
      installment: 48,
      "fund-return": 211,
      income: 93,
    });
  });

  it("has 8 units in stock, 20 on installment and 80 sold", () => {
    const units = parsed.records.filter((r) => r.type === "unit");
    const count = (s: string) => units.filter((u) => u.status === s).length;
    expect(count("in-stock")).toBe(8);
    expect(count("installment")).toBe(20);
    expect(count("sold")).toBe(80);
  });

  it("matches the totals the live app showed on 22 Oct 2026", () => {
    expect(computeSummary(parsed.records)).toEqual({
      fund: 19310,
      inventory: 29000,
      income: 171500,
      divided: 85750,
    });
  });
});

describe("computeSummary", () => {
  const base = { transactionId: "TXN-001" };

  it("is all zeros for no records", () => {
    expect(computeSummary([])).toEqual({ fund: 0, inventory: 0, income: 0, divided: 0 });
  });

  it("skips soft-deleted records", () => {
    const records: Transaction[] = [
      { ...base, type: "fund", amount: 1000, date: "2026-01-01" },
      { ...base, type: "fund", amount: 500, date: "2026-01-02", deleted: true },
    ];
    expect(computeSummary(records).fund).toBe(1000);
  });

  it("subtracts remits and expenses from the fund", () => {
    const records: Transaction[] = [
      { ...base, type: "fund", amount: 10000, date: "2026-01-01" },
      { ...base, type: "expense", amount: 3000, date: "2026-01-02", reason: "Unit purchase: X", unitId: "u1" },
      { ...base, type: "remit", amount: 2000, date: "2026-01-03" },
    ];
    expect(computeSummary(records).fund).toBe(5000);
  });

  it("counts only in-stock units as inventory", () => {
    const unit = {
      ...base,
      type: "unit" as const,
      name: "Phone",
      category: "Android",
      condition: "Brandnew",
      imei: "0",
      cost: 4000,
      date: "2026-01-01",
    };
    const records: Transaction[] = [
      { ...unit, status: "in-stock" },
      { ...unit, status: "installment" },
      { ...unit, status: "sold", soldFor: 5000 },
    ];
    expect(computeSummary(records).inventory).toBe(4000);
  });
});
