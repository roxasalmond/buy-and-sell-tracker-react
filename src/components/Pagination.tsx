import { PAGE_SIZES, pageItems } from "../domain/paginate";
import type { Page } from "../domain/paginate";

interface Props {
  page: Page<unknown>;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

export function Pagination({ page, pageSize, onPage, onPageSize }: Props) {
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="pager-info">
        {page.from}-{page.to} of {page.total}
      </span>

      <div className="pager-nav">
        <button
          type="button"
          className="pager-btn pager-arrow"
          onClick={() => onPage(page.page - 1)}
          disabled={page.page <= 1}
          aria-label="Previous page"
        >
          ‹
        </button>

        <div className="pager-numbers">
          {pageItems(page.page, page.pageCount).map((item, i) =>
            item === "ellipsis" ? (
              <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={item === page.page ? "pager-btn active" : "pager-btn"}
                aria-current={item === page.page ? "page" : undefined}
                aria-label={`Page ${item}`}
                onClick={() => onPage(item)}
              >
                {item}
              </button>
            ),
          )}
        </div>

        <span className="pager-compact">
          Page {page.page} of {page.pageCount}
        </span>

        <button
          type="button"
          className="pager-btn pager-arrow"
          onClick={() => onPage(page.page + 1)}
          disabled={page.page >= page.pageCount}
          aria-label="Next page"
        >
          ›
        </button>
      </div>

      <label className="pager-size">
        Rows
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}
