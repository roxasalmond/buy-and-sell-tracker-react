import { PAGE_SIZES } from "../domain/paginate";
import type { Page } from "../domain/paginate";

interface Props {
  page: Page<unknown>;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

export function Pagination({ page, pageSize, onPage, onPageSize }: Props) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-info">
        {page.from}-{page.to} of {page.total}
      </span>
      <label className="pagination-size">
        Rows
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => onPage(page.page - 1)} disabled={page.page <= 1}>
        Prev
      </button>
      <span className="pagination-page">
        {page.page} / {page.pageCount}
      </span>
      <button type="button" onClick={() => onPage(page.page + 1)} disabled={page.page >= page.pageCount}>
        Next
      </button>
    </nav>
  );
}
