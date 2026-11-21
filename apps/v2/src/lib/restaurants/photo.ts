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
