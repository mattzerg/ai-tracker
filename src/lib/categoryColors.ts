// Accent palette for tool categories. Used as the OG card stripe so tool
// share cards have category-level visual differentiation. Unknown categories
// fall back to the original tool-green.

export const CATEGORY_COLORS: Record<string, string> = {
  "agent-framework": "#7c3aed",
  "ide": "#0a8a4f",
  "chat": "#0ea5e9",
  "rag": "#d97706",
  "search": "#dc2626",
  "voice": "#db2777",
  "image-gen": "#9333ea",
  "video-gen": "#c026d3",
  "audio-gen": "#e11d48",
  "vector-db": "#f59e0b",
  "eval": "#14b8a6",
  "monitoring": "#059669",
  "scraping": "#0891b2",
  "browser-automation": "#0369a1",
  "research": "#7c2d12",
  "writing": "#475569",
  "code-review": "#16a34a",
  "data-analysis": "#0d9488",
  "spreadsheet": "#15803d",
  "presentation": "#a855f7",
  "design": "#ec4899",
  "marketing": "#f97316",
  "sales": "#ea580c",
  "support": "#84cc16",
  "ops": "#3b82f6",
};

const FALLBACK = "#0a8a4f"; // tool-default green

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? FALLBACK;
}

// Short uppercase code for a category, used in monogram squares on OG cards.
// Words separated by - or _ become initials (agent-framework → "AF"); short
// single-word categories use the first 3 chars (rag → "RAG").
export function categoryCode(category: string): string {
  const parts = category.split(/[-_]/).filter(Boolean);
  if (parts.length >= 2) return parts.map((p) => p[0]).join("").toUpperCase();
  return category.slice(0, 3).toUpperCase();
}
