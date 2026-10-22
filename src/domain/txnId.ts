/** TXN-001 style ids. The number comes from the counter at metadata/transactionCounter. */
export function formatTxnId(n: number): string {
  return `TXN-${String(n).padStart(3, "0")}`;
}

/** The ids for a reserved block: `last` is the counter value after reserving `count` ids. */
export function idsForBlock(last: number, count: number): string[] {
  const first = last - count + 1;
  return Array.from({ length: count }, (_, i) => formatTxnId(first + i));
}
