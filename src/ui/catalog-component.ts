/**
 * Catalog UI View Model & Component for PolyFind
 * Manages UI view state (loading, empty, error, results) and renders
 * structured filters and product cards according to the documented API contract.
 */

import type { Product, ProductFilters } from "../contracts/types.js";
import { CatalogApiClient } from "./catalog-client.js";
import type { CatalogUIState } from "./types.js";

export class CatalogController {
  private client: CatalogApiClient;
  private state: CatalogUIState;
  private listeners: Array<(state: CatalogUIState) => void> = [];

  constructor(client: CatalogApiClient) {
    this.client = client;
    this.state = {
      loading: false,
      error: null,
      empty: false,
      items: [],
      filters: {},
      pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
      mode: client.getMode(),
    };
  }

  getState(): CatalogUIState {
    return { ...this.state, items: [...this.state.items], filters: { ...this.state.filters } };
  }

  subscribe(listener: (state: CatalogUIState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    const current = this.getState();
    for (const listener of this.listeners) {
      listener(current);
    }
  }

  async setFilters(filters: ProductFilters & { q?: string }): Promise<void> {
    this.state.filters = { ...filters };
    this.state.pagination.page = 1;
    await this.load();
  }

  async setPage(page: number): Promise<void> {
    this.state.pagination.page = page;
    await this.load();
  }

  async load(): Promise<void> {
    this.state.loading = true;
    this.state.error = null;
    this.notify();

    try {
      const response = await this.client.fetchCatalog({
        q: this.state.filters.q,
        categoryId: this.state.filters.categoryId,
        minPrice: this.state.filters.minPrice,
        maxPrice: this.state.filters.maxPrice,
        inStock: this.state.filters.inStock,
        page: this.state.pagination.page,
        limit: this.state.pagination.limit,
      });

      this.state.loading = false;
      this.state.items = response.items;
      this.state.pagination = {
        page: response.page,
        limit: response.limit,
        total: response.total,
        totalPages: response.totalPages,
      };
      this.state.empty = response.items.length === 0;
      this.state.error = null;
    } catch (err) {
      this.state.loading = false;
      this.state.error = err instanceof Error ? err.message : String(err);
      this.state.items = [];
      this.state.empty = false;
    }

    this.notify();
  }

  /**
   * Renders semantic HTML representation of the catalog UI.
   * Exposes explicit data-testid attributes for testing state visibility.
   */
  render(): string {
    const { loading, error, empty, items, filters, pagination } = this.state;

    let contentHtml = "";

    if (loading) {
      contentHtml = `
        <div data-testid="loading-state" class="loading-spinner" role="status">
          <span>Loading catalog products...</span>
        </div>`;
    } else if (error) {
      contentHtml = `
        <div data-testid="error-state" class="error-alert" role="alert">
          <h3>Failed to load catalog</h3>
          <p>${error}</p>
        </div>`;
    } else if (empty) {
      contentHtml = `
        <div data-testid="empty-state" class="empty-banner">
          <h3>No products found</h3>
          <p>No products match the selected filters. Try broadening your criteria.</p>
        </div>`;
    } else {
      const productCards = items
        .map(
          (item) => `
        <article data-testid="product-card" data-product-id="${item.id}" class="product-card">
          <h4>${item.name}</h4>
          <p class="description">${item.description}</p>
          <div class="product-meta">
            <span class="price">$${item.price.toFixed(2)}</span>
            <span class="stock">${item.stock > 0 ? `${item.stock} in stock` : "Out of stock"}</span>
            <span class="version">v${item.version}</span>
          </div>
        </article>`,
        )
        .join("\n");

      contentHtml = `
        <div data-testid="product-grid" class="product-grid">
          ${productCards}
        </div>
        <div data-testid="pagination-controls" class="pagination">
          <span>Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} items)</span>
        </div>`;
    }

    return `
      <section class="polyfind-catalog">
        <header class="catalog-header">
          <h2>Product Catalog</h2>
        </header>

        <form data-testid="filter-controls" class="filter-controls" onsubmit="return false;">
          <input type="text" name="q" placeholder="Search products..." value="${filters.q || ""}" />
          <select name="categoryId">
            <option value="">All Categories</option>
            <option value="cat-outdoors" ${filters.categoryId === "cat-outdoors" ? "selected" : ""}>Outdoors & Camping</option>
            <option value="cat-electronics" ${filters.categoryId === "cat-electronics" ? "selected" : ""}>Consumer Electronics</option>
            <option value="cat-kitchen" ${filters.categoryId === "cat-kitchen" ? "selected" : ""}>Kitchen & Dining</option>
          </select>
          <label>
            <input type="checkbox" name="inStock" ${filters.inStock ? "checked" : ""} />
            In Stock Only
          </label>
        </form>

        <main class="catalog-content">
          ${contentHtml}
        </main>
      </section>`;
  }
}
