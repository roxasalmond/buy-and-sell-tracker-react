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

export type PageItem = number | "ellipsis";

/**
 * Page buttons to show: always the first and last page, the current page and one on each side.
 * A gap of one page is filled with that page (no ellipsis hiding a single number); bigger gaps get an ellipsis.
 */
export function pageItems(current: number, pageCount: number): PageItem[] {
  const wanted = new Set<number>([1, pageCount, current - 1, current, current + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  const out: PageItem[] = [];
  let previous = 0;
  for (const n of pages) {
    if (n - previous === 2) out.push(previous + 1);
    else if (n - previous > 2) out.push("ellipsis");
    out.push(n);
    previous = n;
  }
  return out;
}
