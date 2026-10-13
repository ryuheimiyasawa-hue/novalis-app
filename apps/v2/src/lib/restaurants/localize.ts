// The shop name and the city are typed in Japanese by the admins. English
// and Tagalog readers get the English spelling when an admin has entered
// one, and the Japanese value otherwise, so a row never shows up blank.
// Tagalog uses the English spelling, like prefecture names do.

type Language = "ja" | "en" | "tl";

function pick(ja: string, en: string | null | undefined, language: Language): string {
  if (language === "ja") return ja;
  return en?.trim() || ja;
}

export function pickRestaurantName(
  r: { name: string; name_en?: string | null },
  language: Language,
): string {
  return pick(r.name, r.name_en, language);
}

export function pickRestaurantCity(
  r: { city_name: string; city_name_en?: string | null },
  language: Language,
): string {
  return pick(r.city_name, r.city_name_en, language);
}
