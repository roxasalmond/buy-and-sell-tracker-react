import { describe, expect, it } from "vitest";
import { paginate } from "./paginate";

const items = Array.from({ length: 23 }, (_, i) => i + 1);

describe("paginate", () => {
  it("slices a page and reports the range", () => {
    const p = paginate(items, 2, 10);
    expect(p.rows).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect([p.from, p.to, p.pageCount, p.total]).toEqual([11, 20, 3, 23]);
  });

  it("gives a short last page", () => {
    const p = paginate(items, 3, 10);
    expect(p.rows).toEqual([21, 22, 23]);
    expect([p.from, p.to]).toEqual([21, 23]);
  });

  it("clamps an out-of-range page", () => {
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate(items, 0, 10).page).toBe(1);
    expect(paginate(items, Number.NaN, 10).page).toBe(1);
  });

  it("handles an empty list", () => {
    const p = paginate([], 1, 10);
    expect([p.rows.length, p.page, p.pageCount, p.from, p.to]).toEqual([0, 1, 1, 0, 0]);
  });
});
