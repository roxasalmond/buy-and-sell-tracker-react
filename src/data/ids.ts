import { ref, runTransaction } from "firebase/database";
import { idsForBlock } from "../domain/txnId";
import { db } from "../lib/firebase";

/**
 * Reserve `count` consecutive transaction ids in ONE atomic step on
 * metadata/transactionCounter. Two devices can never get the same number.
 *
 * If the save that follows fails, the reserved numbers are simply skipped (a gap in the
 * TXN numbering). That is safe; a duplicate would not be.
 */
export async function reserveIds(count: number): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1) throw new Error(`Cannot reserve ${count} ids`);

  const result = await runTransaction(ref(db, "metadata/transactionCounter"), (current: unknown) =>
    (typeof current === "number" ? current : 0) + count,
  );
  if (!result.committed) throw new Error("Could not reserve transaction ids");

  const last: unknown = result.snapshot.val();
  if (typeof last !== "number") throw new Error("Transaction counter is not a number");
  return idsForBlock(last, count);
}
