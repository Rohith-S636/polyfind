import React from "react";
import type { Product } from "../../src/contracts/types";
import { ProductCard } from "./ProductCard";

interface ProductGridProps {
  products: Array<{ product: Product; score?: number }>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClearFilters: () => void;
  onOpenDetails: (product: Product) => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  loading,
  error,
  onRetry,
  onClearFilters,
  onOpenDetails,
}) => {
  if (error) {
    return (
      <div className="error-state" role="alert">
        <h3 className="error-title">Retrieval Request Failed</h3>
        <p className="error-desc">{error}</p>
        <button type="button" className="retry-btn" onClick={onRetry}>
          Try Again
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="product-grid" aria-busy="true" aria-label="Loading products">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div key={idx} className="skeleton-card">
            <div className="skeleton-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="empty-state" role="status">
        <div className="empty-icon" aria-hidden="true">🔍</div>
        <h3 className="empty-title">No matching products found</h3>
        <p className="empty-desc">
          We couldn&apos;t find any catalogue items matching your current search query or applied filter constraints.
        </p>
        <button
          type="button"
          className="search-submit-btn"
          style={{ margin: "0 auto", borderRadius: "var(--radius-sm)" }}
          onClick={onClearFilters}
        >
          Reset Filters & Search
        </button>
      </div>
    );
  }

  return (
    <div className="product-grid" data-testid="product-grid">
      {products.map(({ product, score }) => (
        <ProductCard
          key={product.id}
          product={product}
          score={score}
          onOpenDetails={onOpenDetails}
        />
      ))}
    </div>
  );
};
