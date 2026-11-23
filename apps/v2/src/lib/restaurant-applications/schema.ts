import { createHmac } from "node:crypto";
import { z } from "zod";
import { PREFECTURES } from "@/lib/i18n/prefectures";

// Public self-registration form for restaurants (design:
// tasks/restaurant-onboarding/design.md). Validated here, at the API
// boundary; the DB check constraints repeat the same limits as a backstop.

const PREFECTURE_CODES = new Set(PREFECTURES.map((p) => p.code));

// Trim, and turn "" into null so optional fields left blank are stored as
// null rather than as empty strings.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const requiredText = (max: number) => z.string().trim().min(1).max(max);

// Shops often paste a Facebook page without the scheme; accept that and
// store https. Anything that is not then a valid https URL is rejected.
const optionalHttpsUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => {
    if (v === "") return null;
    if (/^http:\/\//i.test(v)) return v.replace(/^http:\/\//i, "https://");
    if (!/^https:\/\//i.test(v)) return `https://${v}`;
    return v;
  })
  .refine((v) => {
    if (v === null) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && u.hostname.includes(".");
    } catch {
      return false;
    }
  }, "website_url")
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const RestaurantApplicationSchema = z.object({
  name: requiredText(100),
  prefecture_code: z
    .string()
    .refine((v) => PREFECTURE_CODES.has(v), "prefecture_code"),
  city_name: requiredText(100),
  address: optionalText(200),
  hours: optionalText(200),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === "" || /^[0-9+\-() ]{6,30}$/.test(v), "phone")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  website_url: optionalHttpsUrl,
  description: optionalText(1000),
  description_lang: z.enum(["ja", "en", "tl"]).default("ja"),
  contact_name: requiredText(100),
  contact_email: z.string().trim().max(254).email(),
  // Must be literally true: the shop agrees to have these details published.
  consent: z.literal(true),
  source_code: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]*$/)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  // Honeypot: a field hidden from people. Bots fill every input; a
  // non-empty value means the submission is dropped (but answered 201 so
  // the bot learns nothing).
  company_website: z.string().max(500).optional(),
});

export type RestaurantApplicationInput = z.infer<
  typeof RestaurantApplicationSchema
>;

/** Max submissions per IP per hour. A real shop submits once. */
export const APPLICATIONS_PER_IP_PER_HOUR = 5;

/**
 * First hop of x-forwarded-for (Vercel sets it to the client address).
 * Falls back to a constant so a missing header still gets rate limited,
 * just as one shared bucket.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Keyed hash of the IP, so the table never holds raw addresses. Keyed with
 * a server-only secret: a plain sha256 of an IPv4 address is reversible by
 * brute force over the 2^32 space.
 */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`restaurant-apply:${ip}`).digest("hex");
}
