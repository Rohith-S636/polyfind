import React from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  disabled = false,
}) => {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Product pagination">
      <button
        type="button"
        className="pagination-btn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={disabled || currentPage <= 1}
        aria-label="Go to previous page"
      >
        ← Previous
      </button>

      <span className="pagination-info" aria-current="page">
        Page {currentPage} of {totalPages}
      </span>

      <button
        type="button"
        className="pagination-btn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={disabled || currentPage >= totalPages}
        aria-label="Go to next page"
      >
        Next →
      </button>
    </nav>
  );
};
