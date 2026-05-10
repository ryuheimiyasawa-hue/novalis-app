import { z } from "zod";
import { PrefectureCodeSchema, SlugSchema } from "@/lib/admin/schemas";

// Query schemas for the read-only /api/{categories,articles,faqs,experts}
// endpoints exposed to the public PWA. They sit in their own file because
// the admin schemas describe write payloads and the constraints differ
// (e.g. q is search-only, never validated as a body field).

const PageSchema = z.coerce.number().int().min(1).max(500).default(1);
const LimitSchema = z.coerce.number().int().min(1).max(50).default(20);

// Search keyword. Capped to 100 chars and we strip LIKE wildcards before
// passing to the DB so a stray % cannot turn into a slow scan.
const SearchSchema = z.string().min(1).max(100);

export function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, "\\$&");
}

export const PublicArticleListQuerySchema = z.object({
  category_slug: SlugSchema.optional(),
  prefecture_code: PrefectureCodeSchema.optional(),
  q: SearchSchema.optional(),
  page: PageSchema.optional(),
  limit: LimitSchema.optional(),
});
export type PublicArticleListQuery = z.infer<typeof PublicArticleListQuerySchema>;

export const PublicFaqListQuerySchema = z.object({
  category_slug: SlugSchema.optional(),
  q: SearchSchema.optional(),
});

export const PublicExpertListQuerySchema = z.object({
  prefecture_code: PrefectureCodeSchema.optional(),
});
