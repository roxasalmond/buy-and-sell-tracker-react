export const PAGE_SIZES = [9, 18, 27] as const;

export interface Page<T> {
  rows: T[];
  /** 1-based, clamped into range. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based position of the first and last row shown (0 when empty). */
  from: number;
  to: number;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  const start = (current - 1) * pageSize;
  const rows = items.slice(start, start + pageSize);
  return {
    rows,
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + rows.length,
  };
}
