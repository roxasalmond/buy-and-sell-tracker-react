import { describe, expect, it } from "vitest";
import { formatTxnId, idsForBlock } from "./txnId";

describe("transaction ids", () => {
  it("pads to three digits and keeps longer numbers whole", () => {
    expect(formatTxnId(5)).toBe("TXN-005");
    expect(formatTxnId(610)).toBe("TXN-610");
    expect(formatTxnId(1000)).toBe("TXN-1000");
  });

  it("builds a reserved block in order", () => {
    expect(idsForBlock(612, 3)).toEqual(["TXN-610", "TXN-611", "TXN-612"]);
    expect(idsForBlock(611, 1)).toEqual(["TXN-611"]);
  });
});
