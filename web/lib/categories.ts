export interface CategoryInfo {
  id: string;
  name: string;
}

export const CATEGORIES: readonly CategoryInfo[] = [
  { id: "cat-outdoors", name: "Outdoors & Camping" },
  { id: "cat-electronics", name: "Consumer Electronics" },
  { id: "cat-kitchen", name: "Kitchen & Dining" },
  { id: "cat-fitness", name: "Fitness & Exercise" },
  { id: "cat-audio", name: "Pro Audio & Headphones" },
];

export const EXAMPLE_QUERIES = [
  "waterproof backpack",
  "mechanical keyboard",
  "coffee grinder",
  "studio headphones",
  "yoga mat",
  "power bank",
  "tent",
] as const;

export function getCategoryName(categoryId: string | undefined): string {
  if (!categoryId) return "Uncategorized";
  const found = CATEGORIES.find((c) => c.id === categoryId);
  return found ? found.name : categoryId;
}
