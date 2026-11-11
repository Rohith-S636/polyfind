import React from "react";

export type SortOption = "relevance" | "price-asc" | "price-desc" | "updatedAt" | "name";

interface SortControlsProps {
  total: number;
  query: string;
  sort: SortOption;
  onSortChange: (newSort: SortOption) => void;
  strategy?: string;
  freshness?: {
    mode: "strict" | "best-effort";
    status: "verified" | "degraded" | "unavailable";
    checkedAt: string;
  };
  timings?: {
    totalMs: number;
    retrievalMs?: number;
    validationMs?: number;
  };
}

export const SortControls: React.FC<SortControlsProps> = ({
  total,
  query,
  sort,
  onSortChange,
  strategy,
  freshness,
  timings,
}) => {
  return (
    <div>
      <div className="results-header">
        <div className="results-meta">
          <span className="results-count">
            {total} {total === 1 ? "product" : "products"} found
          </span>
          {query && (
            <span>
              for <strong className="active-query-text">&ldquo;{query}&rdquo;</strong>
            </span>
          )}
        </div>

        <div className="sort-group">
          <label htmlFor="sort-select" className="sort-label">
            Sort by:
          </label>
          <select
            id="sort-select"
            className="filter-select"
            style={{ width: "auto" }}
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
          >
            <option value="relevance">Relevance</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="updatedAt">Newest Updated</option>
            <option value="name">Product Name (A-Z)</option>
          </select>
        </div>
      </div>

      {(strategy || freshness || timings) && (
        <div className="diagnostic-bar" role="region" aria-label="Search strategy and freshness metadata">
          {strategy && (
            <span className="badge badge-strategy" title="Adaptive planner execution strategy">
              Strategy: {strategy}
            </span>
          )}
          {freshness && (
            <span
              className={`badge badge-freshness ${freshness.status !== "verified" ? freshness.status : ""}`}
              title={`Checked at ${new Date(freshness.checkedAt).toLocaleTimeString()}`}
            >
              Freshness: {freshness.status.toUpperCase()} ({freshness.mode})
            </span>
          )}
          {timings && (
            <span style={{ color: "var(--text-muted)" }}>
              Latency: {timings.totalMs}ms
              {timings.retrievalMs !== undefined ? ` (retrieval: ${timings.retrievalMs}ms` : ""}
              {timings.validationMs !== undefined ? `, validation: ${timings.validationMs}ms)` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
