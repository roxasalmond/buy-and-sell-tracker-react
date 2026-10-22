/** Round to centavos so repeated additions never drift (0.1 + 0.2 style errors). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Display format used by the current app: ₱20000.00 (no thousands separator). */
export function formatPeso(n: number): string {
  return `₱${round2(n).toFixed(2)}`;
}
