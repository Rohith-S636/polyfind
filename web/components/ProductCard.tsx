import React, { useState } from "react";
import type { Product } from "../../src/contracts/types";
import { getCategoryName } from "../lib/categories";

interface ProductCardProps {
  product: Product;
  score?: number | undefined;
  onOpenDetails: (product: Product) => void;
}

function renderCategoryPlaceholder(categoryId: string) {
  switch (categoryId) {
    case "cat-outdoors":
      return (
        <svg
          className="card-placeholder-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
        </svg>
      );
    case "cat-electronics":
      return (
        <svg
          className="card-placeholder-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect width="20" height="14" x="2" y="3" rx="2" />
          <line x1="8" x2="16" y1="21" y2="21" />
          <line x1="12" x2="12" y1="17" y2="21" />
        </svg>
      );
    case "cat-kitchen":
      return (
        <svg
          className="card-placeholder-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 13.8V4a2 2 0 1 1 4 0v9.8a3.5 3.5 0 1 1-4 0Z" />
          <path d="M14 4v16" />
          <path d="M18 4v8" />
        </svg>
      );
    case "cat-fitness":
      return (
        <svg
          className="card-placeholder-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6.5 6.5 11 11" />
          <path d="m21 21-1-1" />
          <path d="m3 3 1 1" />
          <path d="m18 22 4-4" />
          <path d="m2 6 4-4" />
          <path d="m3 10 7-7" />
          <path d="m14 21 7-7" />
        </svg>
      );
    case "cat-audio":
      return (
        <svg
          className="card-placeholder-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
        </svg>
      );
    default:
      return (
        <svg
          className="card-placeholder-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m21 16-4-4-4 4" />
          <path d="m17 12V3" />
          <path d="M20 21H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2Z" />
        </svg>
      );
  }
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  score,
  onOpenDetails,
}) => {
  const [imgError, setImgError] = useState(false);

  const hasImage = Boolean(product.imageUrl && !imgError);
  const isDemo = product.dataSource === "demo" || !product.dataSource;
  const inStock = product.stock > 0;
  const currency = product.currency || "USD";

  return (
    <article className="product-card" data-testid="product-card">
      <div className="card-image-wrap">
        {hasImage ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="card-image"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          renderCategoryPlaceholder(product.categoryId)
        )}

        <span className="provenance-pill" title="Research prototype seeded catalog record">
          {isDemo ? "Synthetic Demo Data" : "Catalog Listing"}
        </span>
      </div>

      <div className="card-body">
        <div className="card-category">{getCategoryName(product.categoryId)}</div>
        <h3 className="card-title" title={product.name}>
          {product.name}
        </h3>
        {product.brand && <div className="card-brand">Brand: {product.brand}</div>}
        {product.description && (
          <p className="card-desc" title={product.description}>
            {product.description}
          </p>
        )}

        {score !== undefined && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            Relevance Score: <strong>{(score * 100).toFixed(1)}%</strong>
          </div>
        )}

        <div className="card-footer">
          <div className="price-stock-group">
            <span className="product-price">
              ${product.price.toFixed(2)}
              <span className="product-currency">{currency}</span>
            </span>
            <span className={`stock-badge ${inStock ? "stock-in" : "stock-out"}`}>
              {inStock ? `● ${product.stock} in stock` : "○ Out of stock"}
            </span>
          </div>

          <button
            type="button"
            className="card-detail-btn"
            onClick={() => onOpenDetails(product)}
            aria-label={`View details for ${product.name}`}
          >
            View Details
          </button>
        </div>
      </div>
    </article>
  );
};
