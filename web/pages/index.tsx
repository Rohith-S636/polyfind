import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { Header } from "../components/Header";
import { SearchBar } from "../components/SearchBar";
import { CategoryNav } from "../components/CategoryNav";
import { FilterSidebar, type FilterValues } from "../components/FilterSidebar";
import { SortControls, type SortOption } from "../components/SortControls";
import { ProductGrid } from "../components/ProductGrid";
import { ProductModal } from "../components/ProductModal";
import { Pagination } from "../components/Pagination";
import {
  executeSearch,
  fetchHealth,
  type HealthResponse,
  type SearchApiResult,
} from "../lib/api";
import type { Product } from "../../src/contracts/types";

export default function SearchPage() {
  const router = useRouter();

  // Health state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);

  // Search parameters
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ freshnessMode: "strict" });
  const [sort, setSort] = useState<SortOption>("relevance");
  const [page, setPage] = useState(1);

  // Results state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchApiResult | null>(null);

  // Active modal product
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Load API Health once
  useEffect(() => {
    let mounted = true;
    fetchHealth()
      .then((data) => {
        if (mounted) {
          setHealth(data);
          setHealthError(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setHealthError(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Parse URL query on initial load or browser navigation
  useEffect(() => {
    if (!router.isReady) return;

    const q = typeof router.query.q === "string" ? router.query.q : "";
    const categoryId = typeof router.query.categoryId === "string" ? router.query.categoryId : undefined;
    const minPrice = typeof router.query.minPrice === "string" ? parseFloat(router.query.minPrice) : undefined;
    const maxPrice = typeof router.query.maxPrice === "string" ? parseFloat(router.query.maxPrice) : undefined;
    const inStock =
      router.query.inStock === "true"
        ? true
        : router.query.inStock === "false"
        ? false
        : undefined;
    const freshnessMode =
      router.query.freshnessMode === "best-effort" ? "best-effort" : "strict";
    const sortParam =
      typeof router.query.sort === "string" &&
      ["relevance", "price-asc", "price-desc", "updatedAt", "name"].includes(router.query.sort)
        ? (router.query.sort as SortOption)
        : "relevance";
    const pageParam =
      typeof router.query.page === "string" && parseInt(router.query.page, 10) > 0
        ? parseInt(router.query.page, 10)
        : 1;

    setQuery(q);
    setFilters({
      categoryId,
      minPrice,
      maxPrice,
      inStock,
      freshnessMode,
    });
    setSort(sortParam);
    setPage(pageParam);
  }, [router.isReady, router.query]);

  // Execute Search / Catalogue fetch
  const runSearch = useCallback(
    async (
      searchQuery: string,
      currentFilters: FilterValues,
      currentSort: SortOption,
      currentPage: number
    ) => {
      setLoading(true);
      setError(null);
      try {
        const result = await executeSearch({
          query: searchQuery,
          categoryId: currentFilters.categoryId,
          minPrice: currentFilters.minPrice,
          maxPrice: currentFilters.maxPrice,
          inStock: currentFilters.inStock,
          freshnessMode: currentFilters.freshnessMode,
          sort: currentSort,
          page: currentPage,
          limit: 12,
        });
        setSearchResult(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load products");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Sync state to URL and trigger search
  const updateUrlAndSearch = (
    newQuery: string,
    newFilters: FilterValues,
    newSort: SortOption,
    newPage: number
  ) => {
    const queryParams: Record<string, string> = {};
    if (newQuery) queryParams.q = newQuery;
    if (newFilters.categoryId) queryParams.categoryId = newFilters.categoryId;
    if (newFilters.minPrice !== undefined) queryParams.minPrice = String(newFilters.minPrice);
    if (newFilters.maxPrice !== undefined) queryParams.maxPrice = String(newFilters.maxPrice);
    if (newFilters.inStock !== undefined) queryParams.inStock = String(newFilters.inStock);
    if (newFilters.freshnessMode && newFilters.freshnessMode !== "strict") {
      queryParams.freshnessMode = newFilters.freshnessMode;
    }
    if (newSort !== "relevance") queryParams.sort = newSort;
    if (newPage > 1) queryParams.page = String(newPage);

    void router.push(
      {
        pathname: router.pathname,
        query: queryParams,
      },
      undefined,
      { shallow: true }
    );

    void runSearch(newQuery, newFilters, newSort, newPage);
  };

  // Trigger search when router is ready
  useEffect(() => {
    if (router.isReady) {
      void runSearch(query, filters, sort, page);
    }
  }, [router.isReady, query, filters, sort, page, runSearch]);

  const handleSearchSubmit = (newQuery: string) => {
    setQuery(newQuery);
    setPage(1);
    updateUrlAndSearch(newQuery, filters, sort, 1);
  };

  const handleSelectCategory = (categoryId: string | undefined) => {
    const updated = { ...filters, categoryId };
    setFilters(updated);
    setPage(1);
    updateUrlAndSearch(query, updated, sort, 1);
  };

  const handleApplyFilters = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setPage(1);
    updateUrlAndSearch(query, newFilters, sort, 1);
  };

  const handleClearFilters = () => {
    const resetFilters: FilterValues = { freshnessMode: "strict" };
    setQuery("");
    setFilters(resetFilters);
    setSort("relevance");
    setPage(1);
    updateUrlAndSearch("", resetFilters, "relevance", 1);
  };

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort);
    setPage(1);
    updateUrlAndSearch(query, filters, newSort, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrlAndSearch(query, filters, sort, newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header health={health} healthError={healthError} />

      <main className="container" id="main-content" style={{ flex: 1 }}>
        {/* Landing / Hero search section */}
        <section className="hero-section" aria-label="Search hero">
          <h2 className="hero-heading">Explore PolyFind Catalogue</h2>
          <p className="hero-desc">
            Coordinate relational, cache, graph, and vector retrieval with strict transactional freshness guarantees.
          </p>

          <SearchBar
            initialQuery={query}
            onSearch={handleSearchSubmit}
            loading={loading}
          />
        </section>

        {/* Category shortcuts */}
        <CategoryNav
          selectedCategoryId={filters.categoryId}
          onSelectCategory={handleSelectCategory}
        />

        {/* Main application body: filters sidebar + products grid */}
        <div className="app-layout">
          <FilterSidebar
            filters={filters}
            onApplyFilters={handleApplyFilters}
            onClearFilters={handleClearFilters}
            isSearchActive={Boolean(query)}
          />

          <section aria-label="Search results">
            <SortControls
              total={searchResult?.total ?? 0}
              query={query}
              sort={sort}
              onSortChange={handleSortChange}
              strategy={searchResult?.strategy}
              freshness={searchResult?.freshness}
              timings={searchResult?.timings}
            />

            <ProductGrid
              products={searchResult?.items ?? []}
              loading={loading}
              error={error}
              onRetry={() => runSearch(query, filters, sort, page)}
              onClearFilters={handleClearFilters}
              onOpenDetails={(p) => setSelectedProduct(p)}
            />

            <Pagination
              currentPage={page}
              totalPages={searchResult?.totalPages ?? 1}
              onPageChange={handlePageChange}
              disabled={loading}
            />
          </section>
        </div>
      </main>

      {/* Accessible Product Detail Modal */}
      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      <footer className="site-footer">
        <div className="container">
          <p>
            PolyFind &mdash; Freshness-Constrained Adaptive Retrieval Research Prototype.
          </p>
          <div className="footer-links">
            <span>MySQL Authoritative Root</span>
            <span>&bull;</span>
            <span>Redis Versioned Cache</span>
            <span>&bull;</span>
            <span>Neo4j Graph Retrievability</span>
            <span>&bull;</span>
            <span>384-Dim Vectors</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
