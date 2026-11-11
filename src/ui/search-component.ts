/**
 * Search UI Controller and Component for PolyFind
 * Manages search form state, strategy badges, freshness badges, and diagnostics.
 * Suppresses internal development diagnostics outside local development.
 */

import type {
  FreshnessMode,
  ProductFilters,
  SearchRequest,
  SearchResponse,
} from "../contracts/types.js";
import { SearchApiClient } from "./search-client.js";

export interface SearchUIState {
  query: string;
  filters: ProductFilters;
  freshnessMode: FreshnessMode;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
  empty: boolean;
  response: SearchResponse | null;
  environment: "development" | "production" | "test";
}

export interface SearchControllerOptions {
  client: SearchApiClient;
  environment?: "development" | "production" | "test" | undefined;
}

export class SearchController {
  private client: SearchApiClient;
  private state: SearchUIState;
  private listeners: Array<(state: SearchUIState) => void> = [];

  constructor(options: SearchControllerOptions) {
    this.client = options.client;
    this.state = {
      query: "",
      filters: {},
      freshnessMode: "strict",
      page: 1,
      limit: 20,
      loading: false,
      error: null,
      empty: false,
      response: null,
      environment: options.environment ?? "development",
    };
  }

  getState(): SearchUIState {
    return {
      ...this.state,
      filters: { ...this.state.filters },
      response: this.state.response ? { ...this.state.response } : null,
    };
  }

  subscribe(listener: (state: SearchUIState) => void): () => void {
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

  setQuery(query: string): void {
    this.state.query = query;
  }

  setFilters(filters: ProductFilters): void {
    this.state.filters = { ...filters };
  }

  setFreshnessMode(mode: FreshnessMode): void {
    this.state.freshnessMode = mode;
  }

  setEnvironment(env: "development" | "production" | "test"): void {
    this.state.environment = env;
    this.notify();
  }

  async executeSearch(): Promise<void> {
    this.state.loading = true;
    this.state.error = null;
    this.notify();

    const request: SearchRequest = {
      query: this.state.query,
      filters: this.state.filters,
      freshnessMode: this.state.freshnessMode,
      page: this.state.page,
      limit: this.state.limit,
    };

    try {
      const response = await this.client.search(request);
      this.state.loading = false;
      this.state.response = response;
      this.state.empty = response.items.length === 0;
      this.state.error = null;
    } catch (err) {
      this.state.loading = false;
      this.state.error = err instanceof Error ? err.message : String(err);
      this.state.response = null;
      this.state.empty = false;
    }

    this.notify();
  }

  /**
   * Renders semantic HTML representation of the Search UI.
   * Includes loading, error, empty, and results states.
   * Internal diagnostics are protected and only shown in local development.
   */
  render(): string {
    const { query, filters, freshnessMode, loading, error, empty, response, environment } = this.state;

    let contentHtml = "";

    if (loading) {
      contentHtml = `
        <div data-testid="search-loading" class="search-loading" role="status">
          <span>Searching catalog with freshness verification...</span>
        </div>`;
    } else if (error) {
      contentHtml = `
        <div data-testid="search-error" class="search-error" role="alert">
          <h3>Search request error</h3>
          <p>${error}</p>
        </div>`;
    } else if (empty) {
      contentHtml = `
        <div data-testid="search-empty" class="search-empty">
          <h3>No matching results</h3>
          <p>No products matched your search and filter criteria.</p>
        </div>`;
    } else if (response) {
      const resultItems = response.items
        .map(
          (item, idx) => `
        <li data-testid="search-result-item" data-product-id="${item.product.id}" class="result-item">
          <div class="result-rank">#${idx + 1}</div>
          <div class="result-body">
            <h4>${item.product.name}</h4>
            <p>${item.product.description}</p>
            <div class="result-badges">
              <span class="badge score-badge">Score: ${item.score.toFixed(2)}</span>
              <span class="badge price-badge">$${item.product.price.toFixed(2)}</span>
              <span class="badge stock-badge">${item.product.stock > 0 ? `${item.product.stock} in stock` : "Out of stock"}</span>
              <span class="badge version-badge">v${item.product.version}</span>
            </div>
          </div>
        </li>`,
        )
        .join("\n");

      // Internal Diagnostics: Protected outside local development
      let diagnosticsHtml = "";
      if (environment === "development") {
        diagnosticsHtml = `
          <aside data-testid="search-diagnostics" class="search-diagnostics dev-mode">
            <h4>Development Diagnostics</h4>
            <dl>
              <dt>Strategy:</dt><dd data-testid="diagnostic-strategy">${response.strategy}</dd>
              <dt>Total Latency:</dt><dd data-testid="diagnostic-total-ms">${response.timings.totalMs}ms</dd>
              <dt>Retrieval Timing:</dt><dd data-testid="diagnostic-retrieval-ms">${response.timings.retrievalMs ?? 0}ms</dd>
              <dt>Validation Timing:</dt><dd data-testid="diagnostic-validation-ms">${response.timings.validationMs ?? 0}ms</dd>
              <dt>Freshness Status:</dt><dd data-testid="diagnostic-freshness-status">${response.freshness.status}</dd>
              <dt>Freshness Mode:</dt><dd data-testid="diagnostic-freshness-mode">${response.freshness.mode}</dd>
              <dt>Checked At:</dt><dd data-testid="diagnostic-checked-at">${response.freshness.checkedAt}</dd>
            </dl>
          </aside>`;
      }

      contentHtml = `
        <div class="search-results-container">
          <div class="results-header">
            <span>Found ${response.total} results</span>
            <span class="badge freshness-status-badge status-${response.freshness.status}">
              Freshness: ${response.freshness.status}
            </span>
          </div>
          <ol data-testid="search-results" class="search-results-list">
            ${resultItems}
          </ol>
          ${diagnosticsHtml}
        </div>`;
    }

    return `
      <section class="polyfind-search">
        <form data-testid="search-form" class="search-form" onsubmit="return false;">
          <div class="search-input-group">
            <input type="text" name="query" placeholder="Search by keywords or description..." value="${query}" />
            <button type="button" data-testid="search-submit">Search</button>
          </div>

          <div data-testid="search-filter-controls" class="filter-controls">
            <select name="categoryId">
              <option value="">All Categories</option>
              <option value="cat-outdoors" ${filters.categoryId === "cat-outdoors" ? "selected" : ""}>Outdoors</option>
              <option value="cat-electronics" ${filters.categoryId === "cat-electronics" ? "selected" : ""}>Electronics</option>
              <option value="cat-kitchen" ${filters.categoryId === "cat-kitchen" ? "selected" : ""}>Kitchen</option>
            </select>

            <select name="freshnessMode">
              <option value="strict" ${freshnessMode === "strict" ? "selected" : ""}>Strict Freshness</option>
              <option value="best-effort" ${freshnessMode === "best-effort" ? "selected" : ""}>Best Effort</option>
            </select>

            <label>
              <input type="checkbox" name="inStock" ${filters.inStock ? "checked" : ""} />
              In Stock Only
            </label>
          </div>
        </form>

        <main class="search-content">
          ${contentHtml}
        </main>
      </section>`;
  }
}
