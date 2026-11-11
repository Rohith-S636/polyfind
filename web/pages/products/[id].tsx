import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import { Header } from "../../components/Header";
import { fetchProductById, fetchHealth, type HealthResponse } from "../../lib/api";
import { getCategoryName } from "../../lib/categories";
import type { Product } from "../../../src/contracts/types";

export default function ProductDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    fetchHealth()
      .then((h) => {
        setHealth(h);
        setHealthError(false);
      })
      .catch(() => setHealthError(true));
  }, []);

  useEffect(() => {
    if (!router.isReady || !id || typeof id !== "string") return;

    setLoading(true);
    setError(null);

    fetchProductById(id)
      .then((p) => {
        setProduct(p);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : `Product "${id}" could not be retrieved.`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router.isReady, id]);

  const title = product ? `${product.name} — PolyFind` : "Product Detail — PolyFind";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Head>
        <title>{title}</title>
      </Head>

      <Header health={health} healthError={healthError} />

      <main className="container" id="main-content" style={{ flex: 1, padding: "2rem 1.25rem 4rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <Link href="/" className="footer-link" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 600 }}>
            ← Back to Search
          </Link>
        </div>

        {loading && (
          <div className="skeleton-card" style={{ height: "400px", maxWidth: "800px", margin: "0 auto" }}>
            <div className="skeleton-shimmer" />
          </div>
        )}

        {error && (
          <div className="error-state" style={{ maxWidth: "680px", margin: "2rem auto" }} role="alert">
            <h2 className="error-title">Product Not Found</h2>
            <p className="error-desc">{error}</p>
            <Link href="/" className="search-submit-btn" style={{ display: "inline-block", padding: "0.6rem 1.5rem", borderRadius: "var(--radius-sm)" }}>
              Return to Catalog Search
            </Link>
          </div>
        )}

        {!loading && product && (
          <article
            style={{
              maxWidth: "800px",
              margin: "0 auto",
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-lg)",
              padding: "2rem",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <span className="modal-id-badge">Canonical ID: {product.id} (Version {product.version})</span>
              <span className="provenance-pill" style={{ position: "static" }}>
                {product.dataSource === "demo" || !product.dataSource ? "Synthetic Demo Data" : "Catalog Listing"}
              </span>
            </div>

            <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
              {product.name}
            </h1>

            <div style={{ color: "#38bdf8", fontWeight: 600, fontSize: "0.9rem", marginBottom: "1.25rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Category: {getCategoryName(product.categoryId)}
            </div>

            <div className="modal-notice-banner" role="note">
              <strong>Authoritative Transactional Notice:</strong> Price (${product.price.toFixed(2)}) and stock ({product.stock} units) are retrieved directly from the MySQL transactional authority. Derived vector indices and caches do not mutate transactional facts.
            </div>

            <div className="modal-meta-grid" style={{ margin: "1.5rem 0" }}>
              <div>
                <div className="meta-item-label">Authoritative Price</div>
                <div className="meta-item-value">
                  ${product.price.toFixed(2)} <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{product.currency || "USD"}</span>
                </div>
              </div>
              <div>
                <div className="meta-item-label">Authoritative Stock</div>
                <div className="meta-item-value" style={{ color: product.stock > 0 ? "var(--success-text)" : "var(--error-text)" }}>
                  {product.stock > 0 ? `${product.stock} units available` : "Currently Out of Stock"}
                </div>
              </div>
              {product.brand && (
                <div>
                  <div className="meta-item-label">Brand</div>
                  <div className="meta-item-value" style={{ fontSize: "1rem" }}>
                    {product.brand}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Product Description</h2>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, fontSize: "0.95rem" }}>
                {product.description || "No description provided for this product record."}
              </p>
            </div>

            {product.attributes && Object.keys(product.attributes).length > 0 && (
              <div style={{ marginBottom: "1.5rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Product Specifications</h2>
                <table className="attributes-table" aria-label="Product specifications">
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

            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem", display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)", flexWrap: "wrap", gap: "0.5rem" }}>
              <span>Version: <strong>{product.version}</strong></span>
              <span>Updated: <strong>{new Date(product.updatedAt).toUTCString()}</strong></span>
              <span>Canonical URI: <code>/api/products/{product.id}</code></span>
            </div>
          </article>
        )}
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>PolyFind &mdash; Freshness-Constrained Adaptive Retrieval Research Prototype.</p>
        </div>
      </footer>
    </div>
  );
}
