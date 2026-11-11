import React, { useState, useEffect } from "react";
import { EXAMPLE_QUERIES } from "../lib/categories";

interface SearchBarProps {
  initialQuery?: string;
  onSearch: (query: string) => void;
  loading?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  initialQuery = "",
  onSearch,
  loading = false,
}) => {
  const [inputValue, setInputValue] = useState(initialQuery);

  useEffect(() => {
    setInputValue(initialQuery);
  }, [initialQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(inputValue.trim());
  };

  const handleExampleClick = (example: string) => {
    setInputValue(example);
    onSearch(example);
  };

  return (
    <div className="search-box-container">
      <form onSubmit={handleSubmit} className="search-form" role="search">
        <label htmlFor="search-input" className="sr-only">
          Search products by title, keyword, or description
        </label>
        <input
          id="search-input"
          type="search"
          className="search-input"
          placeholder="Search products (e.g., waterproof backpack, keyboard, coffee grinder)..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          autoComplete="off"
          spellCheck="false"
        />
        <button
          type="submit"
          className="search-submit-btn"
          aria-label="Submit search"
          disabled={loading}
        >
          {loading ? (
            <span>Searching...</span>
          ) : (
            <>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Search</span>
            </>
          )}
        </button>
      </form>

      <div className="example-queries">
        <span>Try searching:</span>
        {EXAMPLE_QUERIES.map((example: string) => (
          <button
            key={example}
            type="button"
            className="query-chip"
            onClick={() => handleExampleClick(example)}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
};
