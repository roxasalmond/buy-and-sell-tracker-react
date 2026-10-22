import { describe, expect, it } from "vitest";
import { toLocalDateString } from "./dates";

describe("toLocalDateString", () => {
  it("uses the local calendar date, not UTC", () => {
    // 02:05 local time on 20 Jan 2026, whatever the machine's time zone is.
    expect(toLocalDateString(new Date(2026, 0, 20, 2, 5))).toBe("2026-01-20");
  });
  it("pads month and day", () => {
    expect(toLocalDateString(new Date(2026, 2, 5, 12, 0))).toBe("2026-03-05");
  });
});
