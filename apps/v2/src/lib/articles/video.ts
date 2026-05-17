// Article video embed helpers (MVP-D).
//
// The articles.video_provider column is constrained to 'youtube' /
// 'vimeo' at the DB level (migration 006 CHECK), but the URL itself
// is editor-pasted free text. To keep iframe src under our control:
//
//   1. parseVideo() takes the (provider, url) pair from the DB and
//      returns either a normalised { provider, videoId } or null.
//   2. buildEmbedUrl() turns the { provider, videoId } into the
//      official, no-cookie embed URL.
//
// Renderers must use buildEmbedUrl() — never the raw video_url —
// so a malformed value cannot smuggle in a non-embed URL (we always
// reach the provider's embed origin, with a known path shape).
//
// Phase 2 video work (multiple videos per article, in-body placement,
// rehype-raw + sanitize iframe whitelist) is deliberately out of scope.
// See proposal D case 1 vs 2/3 trade-offs.

export type VideoProvider = "youtube" | "vimeo";

export interface ParsedVideo {
  provider: VideoProvider;
  /** Provider-specific video id (e.g. "dQw4w9WgXcQ" for YouTube). */
  videoId: string;
}

// YouTube id is 11 chars, base64url-like alphabet. Restricting the
// character class blocks query-string smuggling via the id slot.
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
// Vimeo numeric id only. Up to 12 digits is well above current ids.
const VIMEO_ID_RE = /^[0-9]{1,12}$/;

/** Extract the YouTube video id from any of the common URL shapes:
 *    https://www.youtube.com/watch?v=ID
 *    https://m.youtube.com/watch?v=ID
 *    https://youtu.be/ID
 *    https://www.youtube.com/embed/ID
 *    https://www.youtube.com/shorts/ID
 *  Returns null when the URL does not parse, is not a YouTube
 *  property, or the extracted id fails the strict ID_RE check. */
function parseYouTube(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();

  let id: string | null = null;
  if (host === "youtu.be") {
    // /ID
    id = u.pathname.slice(1).split("/")[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    if (u.pathname === "/watch") {
      id = u.searchParams.get("v");
    } else if (u.pathname.startsWith("/embed/")) {
      id = u.pathname.split("/")[2] ?? null;
    } else if (u.pathname.startsWith("/shorts/")) {
      id = u.pathname.split("/")[2] ?? null;
    } else if (u.pathname.startsWith("/v/")) {
      id = u.pathname.split("/")[2] ?? null;
    }
  }

  if (!id || !YT_ID_RE.test(id)) return null;
  return id;
}

/** Extract the Vimeo numeric id from:
 *    https://vimeo.com/ID
 *    https://vimeo.com/channels/staff/ID
 *    https://vimeo.com/groups/<name>/videos/ID
 *    https://player.vimeo.com/video/ID
 *  Returns null when the URL does not parse, the host is not Vimeo,
 *  or no numeric id segment is found. */
function parseVimeo(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;

  // Walk path segments and return the first numeric one.
  for (const seg of u.pathname.split("/")) {
    if (VIMEO_ID_RE.test(seg)) return seg;
  }
  return null;
}

/** Parse a (provider, url) pair sourced from the articles row. Returns
 *  null when either is missing or when the URL does not match the
 *  provider's URL shape. */
export function parseVideo(
  provider: string | null | undefined,
  url: string | null | undefined,
): ParsedVideo | null {
  if (!provider || !url) return null;
  if (provider === "youtube") {
    const id = parseYouTube(url);
    return id ? { provider: "youtube", videoId: id } : null;
  }
  if (provider === "vimeo") {
    const id = parseVimeo(url);
    return id ? { provider: "vimeo", videoId: id } : null;
  }
  return null;
}

/** Build the canonical embed URL for the parsed video. YouTube uses
 *  youtube-nocookie.com (no tracking cookies set until playback);
 *  Vimeo uses player.vimeo.com with dnt=1 to opt out of Vimeo's own
 *  analytics. Both forms are the provider-blessed embed shape. */
export function buildEmbedUrl(v: ParsedVideo): string {
  if (v.provider === "youtube") {
    return `https://www.youtube-nocookie.com/embed/${v.videoId}?rel=0`;
  }
  return `https://player.vimeo.com/video/${v.videoId}?dnt=1`;
}
