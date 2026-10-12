// Cuisine is free text in the admin form, and the admins write it in
// Japanese ("フィリピン料理", "食材店"). The badge on the restaurant cards
// showed that text to English and Tagalog readers as-is. Known values get
// a label per language; anything else is shown as entered, so a new
// value never disappears — it only waits for a line here.

const CUISINE_LABELS: Record<string, { en: string; tl: string }> = {
  フィリピン料理: { en: "Filipino food", tl: "Pagkaing Pilipino" },
  食材店: { en: "Grocery store", tl: "Grocery" },
};

export function getCuisineLabel(
  cuisine: string,
  language: "ja" | "en" | "tl",
): string {
  if (language === "ja") return cuisine;
  return CUISINE_LABELS[cuisine.trim()]?.[language] ?? cuisine;
}
