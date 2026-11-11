import React from "react";
import { CATEGORIES } from "../lib/categories";

interface CategoryNavProps {
  selectedCategoryId?: string;
  onSelectCategory: (categoryId: string | undefined) => void;
}

export const CategoryNav: React.FC<CategoryNavProps> = ({
  selectedCategoryId,
  onSelectCategory,
}) => {
  return (
    <nav className="category-nav" aria-label="Category shortcuts">
      <button
        type="button"
        className={`category-nav-btn ${!selectedCategoryId ? "active" : ""}`}
        onClick={() => onSelectCategory(undefined)}
      >
        All Products
      </button>
      {CATEGORIES.map((cat: { id: string; name: string }) => (
        <button
          key={cat.id}
          type="button"
          className={`category-nav-btn ${selectedCategoryId === cat.id ? "active" : ""}`}
          onClick={() => onSelectCategory(cat.id === selectedCategoryId ? undefined : cat.id)}
        >
          {cat.name}
        </button>
      ))}
    </nav>
  );
};
