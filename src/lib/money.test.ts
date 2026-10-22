import { describe, expect, it } from "vitest";
import { formatPeso, round2 } from "./money";

describe("round2", () => {
  it("removes floating point drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
  it("keeps whole pesos unchanged", () => {
    expect(round2(24000)).toBe(24000);
  });
  it("rounds to centavos", () => {
    expect(round2(1.005)).toBe(1.01);
  });
});

describe("formatPeso", () => {
  it("matches the current app's display", () => {
    expect(formatPeso(20000)).toBe("₱20000.00");
    expect(formatPeso(-2690)).toBe("₱-2690.00");
  });
});
