import React, { useState, useEffect } from "react";
import { CATEGORIES } from "../lib/categories";

export interface FilterValues {
  categoryId?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  inStock?: boolean | undefined;
  freshnessMode?: "strict" | "best-effort" | undefined;
}

interface FilterSidebarProps {
  filters: FilterValues;
  onApplyFilters: (newFilters: FilterValues) => void;
  onClearFilters: () => void;
  isSearchActive: boolean;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  onApplyFilters,
  onClearFilters,
  isSearchActive,
}) => {
  const [localCategory, setLocalCategory] = useState(filters.categoryId || "");
  const [localMinPrice, setLocalMinPrice] = useState(
    filters.minPrice !== undefined ? String(filters.minPrice) : ""
  );
  const [localMaxPrice, setLocalMaxPrice] = useState(
    filters.maxPrice !== undefined ? String(filters.maxPrice) : ""
  );
  const [localInStock, setLocalInStock] = useState<string>(
    filters.inStock === true ? "true" : filters.inStock === false ? "false" : "all"
  );
  const [localFreshness, setLocalFreshness] = useState<"strict" | "best-effort">(
    filters.freshnessMode || "strict"
  );

  useEffect(() => {
    setLocalCategory(filters.categoryId || "");
    setLocalMinPrice(filters.minPrice !== undefined ? String(filters.minPrice) : "");
    setLocalMaxPrice(filters.maxPrice !== undefined ? String(filters.maxPrice) : "");
    setLocalInStock(
      filters.inStock === true ? "true" : filters.inStock === false ? "false" : "all"
    );
    setLocalFreshness(filters.freshnessMode || "strict");
  }, [filters]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const min = localMinPrice ? parseFloat(localMinPrice) : undefined;
    const max = localMaxPrice ? parseFloat(localMaxPrice) : undefined;
    const inStock =
      localInStock === "true" ? true : localInStock === "false" ? false : undefined;

    onApplyFilters({
      categoryId: localCategory || undefined,
      minPrice: min !== undefined && !Number.isNaN(min) && min >= 0 ? min : undefined,
      maxPrice: max !== undefined && !Number.isNaN(max) && max >= 0 ? max : undefined,
      inStock,
      freshnessMode: localFreshness,
    });
  };

  const hasActiveFilters = Boolean(
    filters.categoryId ||
      filters.minPrice !== undefined ||
      filters.maxPrice !== undefined ||
      filters.inStock !== undefined ||
      filters.freshnessMode === "best-effort"
  );

  return (
    <aside className="filter-sidebar" aria-label="Product filters">
      <div className="filter-heading">
        <span>Filters</span>
        {hasActiveFilters && (
          <button
            type="button"
            className="clear-filters-btn"
            onClick={onClearFilters}
            aria-label="Clear all applied filters"
          >
            Clear all
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Category Filter */}
        <div className="filter-group">
          <label htmlFor="filter-category" className="filter-label">
            Category
          </label>
          <select
            id="filter-category"
            className="filter-select"
            value={localCategory}
            onChange={(e) => setLocalCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((cat: { id: string; name: string }) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Price Range Filter */}
        <div className="filter-group">
          <span className="filter-label">Price Range ($)</span>
          <div className="price-inputs">
            <label htmlFor="filter-min-price" className="sr-only">
              Minimum price
            </label>
            <input
              id="filter-min-price"
              type="number"
              min="0"
              step="1"
              placeholder="Min"
              className="filter-input"
              value={localMinPrice}
              onChange={(e) => setLocalMinPrice(e.target.value)}
            />
            <span aria-hidden="true">–</span>
            <label htmlFor="filter-max-price" className="sr-only">
              Maximum price
            </label>
            <input
              id="filter-max-price"
              type="number"
              min="0"
              step="1"
              placeholder="Max"
              className="filter-input"
              value={localMaxPrice}
              onChange={(e) => setLocalMaxPrice(e.target.value)}
            />
          </div>
        </div>

        {/* Stock / Availability Filter */}
        <div className="filter-group">
          <span className="filter-label">Availability</span>
          <div className="radio-group">
            <label className="radio-label">
              <input
                type="radio"
                name="inStock"
                value="all"
                checked={localInStock === "all"}
                onChange={() => setLocalInStock("all")}
              />
              <span>All items</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="inStock"
                value="true"
                checked={localInStock === "true"}
                onChange={() => setLocalInStock("true")}
              />
              <span>In stock only</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="inStock"
                value="false"
                checked={localInStock === "false"}
                onChange={() => setLocalInStock("false")}
              />
              <span>Out of stock only</span>
            </label>
          </div>
        </div>

        {/* Freshness Mode (only for search endpoint) */}
        {isSearchActive && (
          <div className="filter-group">
            <span className="filter-label">Freshness Constraint</span>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="freshnessMode"
                  value="strict"
                  checked={localFreshness === "strict"}
                  onChange={() => setLocalFreshness("strict")}
                />
                <span>Strict (Reject unverified)</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="freshnessMode"
                  value="best-effort"
                  checked={localFreshness === "best-effort"}
                  onChange={() => setLocalFreshness("best-effort")}
                />
                <span>Best-Effort (Permit fallback)</span>
              </label>
            </div>
          </div>
        )}

        <button
          type="submit"
          className="search-submit-btn"
          style={{ width: "100%", borderRadius: "var(--radius-sm)", padding: "0.55rem" }}
        >
          Apply Filters
        </button>
      </form>
    </aside>
  );
};
