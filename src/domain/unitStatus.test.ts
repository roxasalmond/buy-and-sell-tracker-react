import { describe, expect, it } from "vitest";
import { records, findUnit } from "./testFixture";
import type { UnitRecord } from "./schemas";
import { isAvailable, sellRefusal, startInstallmentRefusal, unitEditRefusal } from "./unitStatus";

const units = records.filter((r): r is UnitRecord => r.type === "unit");

describe("isAvailable (what the Units tab shows)", () => {
  it("is exactly the 8 in-stock units in the 22 Oct export, not the 20 on installment", () => {
    expect(units.filter(isAvailable)).toHaveLength(8);
  });
  it("hides a deleted unit", () => {
    expect(isAvailable({ ...findUnit("TXN-162"), deleted: true })).toBe(false);
  });
});

describe("sellRefusal", () => {
  it("allows an in-stock unit", () => {
    expect(sellRefusal(findUnit("TXN-162"))).toBeNull();
  });
  it("refuses a unit that is already sold (the iPad)", () => {
    expect(sellRefusal(findUnit("TXN-045"))?.reason).toBe("already-sold");
  });
  it("refuses a unit that is on an installment plan", () => {
    expect(sellRefusal(findUnit("TXN-003"))?.reason).toBe("on-installment");
  });
  it("refuses a deleted unit", () => {
    expect(sellRefusal({ ...findUnit("TXN-162"), deleted: true })?.reason).toBe("unit-deleted");
  });
  it("treats a missing status as in-stock, like the live app", () => {
    const { status: _status, ...rest } = findUnit("TXN-162");
    expect(sellRefusal({ ...rest } as unknown as UnitRecord)).toBeNull();
  });
});

describe("startInstallmentRefusal", () => {
  it("allows an in-stock unit only", () => {
    expect(startInstallmentRefusal(findUnit("TXN-162"))).toBeNull();
    expect(startInstallmentRefusal(findUnit("TXN-045"))?.reason).toBe("unit-not-in-stock");
    expect(startInstallmentRefusal(findUnit("TXN-003"))?.reason).toBe("unit-not-in-stock");
  });
});

describe("unitEditRefusal", () => {
  const soldViaPlan = findUnit("TXN-185");
  const ordinarySold = units.find((u) => u.status === "sold" && u.installmentId === undefined);

  it("fixture precondition: TXN-185 was sold through an installment plan", () => {
    expect(soldViaPlan.installmentId).toBeDefined();
    expect(ordinarySold).toBeDefined();
  });

  it("blocks changing the cost of a unit sold through a plan", () => {
    expect(unitEditRefusal(soldViaPlan, { cost: soldViaPlan.cost + 100 })?.reason).toBe("installment-money-locked");
  });
  it("blocks changing the sold price of a unit sold through a plan", () => {
    expect(unitEditRefusal(soldViaPlan, { soldFor: (soldViaPlan.soldFor ?? 0) + 100 })?.reason).toBe(
      "installment-money-locked",
    );
  });
  it("allows the same cost and sold price (a rename sends them unchanged)", () => {
    expect(unitEditRefusal(soldViaPlan, { cost: soldViaPlan.cost, soldFor: soldViaPlan.soldFor ?? null })).toBeNull();
  });
  it("allows edits with no money change at all", () => {
    expect(unitEditRefusal(soldViaPlan, {})).toBeNull();
  });
  it("blocks money changes on a unit that is currently on a plan", () => {
    const onPlan = findUnit("TXN-003");
    expect(unitEditRefusal(onPlan, { cost: onPlan.cost + 1 })?.reason).toBe("installment-money-locked");
  });
  it("allows money changes on an ordinary unit", () => {
    if (!ordinarySold) throw new Error("no ordinary sold unit");
    expect(unitEditRefusal(ordinarySold, { cost: ordinarySold.cost + 100 })).toBeNull();
  });
});
