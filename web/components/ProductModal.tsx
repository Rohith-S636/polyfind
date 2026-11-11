import React, { useEffect } from "react";
import type { Product } from "../../src/contracts/types";
import { getCategoryName } from "../lib/categories";

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({ product, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (product) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "auto";
    };
  }, [product, onClose]);

  if (!product) return null;

  const inStock = product.stock > 0;
  const currency = product.currency || "USD";
  const isDemo = product.dataSource === "demo" || !product.dataSource;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-product-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Close product modal"
        >
          ✕
        </button>

        <span className="modal-id-badge">ID: {product.id} (v{product.version})</span>
        <h2 id="modal-product-title" className="modal-title">
          {product.name}
        </h2>

        {isDemo && (
          <div className="modal-notice-banner" role="note">
            <strong>Authoritative Transactional Record (Synthetic Demo Data, Seed 42).</strong>
            <br />
            MySQL serves as the authoritative root of truth for price (${product.price.toFixed(2)}) and stock ({product.stock}). Derived stores (Redis, Neo4j, Vector) reflect this version without mutation.
          </div>
        )}

        <div className="modal-meta-grid">
          <div>
            <div className="meta-item-label">Authoritative Price</div>
            <div className="meta-item-value">
              ${product.price.toFixed(2)} <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{currency}</span>
            </div>
          </div>
          <div>
            <div className="meta-item-label">Authoritative Stock</div>
            <div className="meta-item-value" style={{ color: inStock ? "var(--success-text)" : "var(--error-text)" }}>
              {inStock ? `${product.stock} units` : "Out of stock"}
            </div>
          </div>
          <div>
            <div className="meta-item-label">Category</div>
            <div className="meta-item-value" style={{ fontSize: "0.95rem" }}>
              {getCategoryName(product.categoryId)}
            </div>
          </div>
          {product.brand && (
            <div>
              <div className="meta-item-label">Brand</div>
              <div className="meta-item-value" style={{ fontSize: "0.95rem" }}>
                {product.brand}
              </div>
            </div>
          )}
        </div>

        <div className="modal-desc-heading">Description</div>
        <p className="modal-desc-text">
          {product.description || "No extended description provided for this product record."}
        </p>

        {product.attributes && Object.keys(product.attributes).length > 0 && (
          <div>
            <div className="modal-desc-heading">Authoritative Attributes</div>
            <table className="attributes-table" aria-label="Product attributes">
              <tbody>
                {Object.entries(product.attributes).map(([key, val]) => (
                  <tr key={key}>
                    <th>{key}</th>
                    <td>{String(val)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <span>Last synchronized: {new Date(product.updatedAt).toLocaleString()}</span>
          <a
            href={`/products/${encodeURIComponent(product.id)}`}
            className="footer-link"
            style={{ fontWeight: 600 }}
          >
            Open Dedicated Product Page ↗
          </a>
        </div>
      </div>
    </div>
  );
};
