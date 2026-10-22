import { describe, expect, it } from "vitest";
import { buildUpdates } from "./multiPath";

const fund = {
  type: "fund" as const,
  transactionId: "TXN-611",
  date: "2026-10-22",
  amount: 100,
};

describe("buildUpdates", () => {
  it("writes each new row at its own key", () => {
    let n = 0;
    const updates = buildUpdates({ create: [fund, { ...fund, transactionId: "TXN-612" }] }, () => `k${++n}`);
    expect(Object.keys(updates)).toEqual(["transactions/k1", "transactions/k2"]);
    expect(updates["transactions/k1"]).toEqual(fund);
  });

  it("writes rows that come with their own key at that key", () => {
    const updates = buildUpdates({ createAt: [{ key: "unitKey", row: fund }], create: [fund] }, () => "k1");
    expect(Object.keys(updates)).toEqual(["transactions/k1", "transactions/unitKey"]);
  });

  it("writes patches field by field, keeps null, drops undefined", () => {
    const updates = buildUpdates(
      { patches: [{ key: "u1", fields: { status: "sold", soldFor: null, soldDate: undefined } }] },
      () => "unused",
    );
    expect(updates).toEqual({ "transactions/u1/status": "sold", "transactions/u1/soldFor": null });
  });

  it("drops undefined fields from new rows", () => {
    const updates = buildUpdates({ create: [{ ...fund, createdBy: undefined }] }, () => "k");
    expect(updates["transactions/k"]).toEqual(fund);
  });

  it("returns nothing for an empty write set", () => {
    expect(buildUpdates({}, () => "k")).toEqual({});
  });
});
