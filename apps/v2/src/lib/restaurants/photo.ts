// The seed shops were entered with random stock photos from a placeholder
// service (picsum.photos), so a card could show a deer or a mountain for a
// Filipino grocery. Until the operator replaces them with real shop photos,
// treat those URLs, blanks and anything that is not http(s) as "no photo"
// so the card shows its icon tile instead. Display-only: the stored
// photo_url is not touched.
const PLACEHOLDER_PHOTO_HOSTS = new Set(["picsum.photos", "fastly.picsum.photos"]);

export function displayablePhotoUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // Not an absolute URL: there is nothing safe to render.
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (PLACEHOLDER_PHOTO_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  return trimmed;
}

// Demo shops were seeded with names such as "Kapaya Mart Kawaguchi (Sample)"
// or "…（サンプル）". Showing those to a visitor makes the whole app look
// unfinished, so the public lists leave them out until the operator enters
// real shops. Display-only: the rows stay in the database.
const SAMPLE_NAME_RE = /[(（]\s*(?:sample|サンプル)\s*[)）]/i;

export function isSampleRestaurant(r: {
  name: string | null | undefined;
  name_en?: string | null;
}): boolean {
  return [r.name, r.name_en].some((n) => !!n && SAMPLE_NAME_RE.test(n));
}

/** Shops good enough for the landing showcase: real (not a sample) and
 *  with a photo the card can actually show. An empty result means the
 *  landing hides its shop section; it comes back by itself once real shops
 *  with photos are entered. */
export function showcaseRestaurants<
  T extends { name: string; name_en?: string | null; photo_url: string | null },
>(rows: readonly T[]): T[] {
  return rows.filter((r) => !isSampleRestaurant(r) && displayablePhotoUrl(r.photo_url) !== null);
}
