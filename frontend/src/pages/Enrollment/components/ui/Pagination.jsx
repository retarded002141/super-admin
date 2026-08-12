function buildPageItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);

  const items = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous && page - previous > 1) items.push(`ellipsis-${previous}-${page}`);
    items.push(page);
  });

  return items;
}

function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  className = "",
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const firstItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastItem = Math.min(safePage * pageSize, totalItems);
  const pageItems = buildPageItems(safePage, totalPages);

  const changePage = (nextPage) => {
    const boundedPage = Math.min(Math.max(nextPage, 1), totalPages);
    if (boundedPage !== safePage) onPageChange(boundedPage);
  };

  return (
    <div
      className={`flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
      aria-label="Table pagination"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-500 sm:text-sm">
        <span>
          Showing <strong className="font-bold text-slate-800">{firstItem}-{lastItem}</strong> of{" "}
          <strong className="font-bold text-slate-800">{totalItems}</strong>
        </span>

        {onPageSizeChange && (
          <label className="flex items-center gap-2">
            <span className="sr-only sm:not-sr-only">Rows</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option} per page
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <button
          type="button"
          onClick={() => changePage(safePage - 1)}
          disabled={safePage <= 1}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <i className="fa-solid fa-chevron-left text-[0.65rem]" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        <div className="flex items-center gap-1" aria-label={`Page ${safePage} of ${totalPages}`}>
          {pageItems.map((item) =>
            typeof item === "number" ? (
              <button
                key={item}
                type="button"
                onClick={() => changePage(item)}
                aria-current={item === safePage ? "page" : undefined}
                className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-xs font-bold transition ${
                  item === safePage
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
                }`}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="grid h-9 min-w-6 place-items-center text-xs text-slate-400" aria-hidden="true">
                …
              </span>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => changePage(safePage + 1)}
          disabled={safePage >= totalPages}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <i className="fa-solid fa-chevron-right text-[0.65rem]" />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
