import { z } from "zod";

// Slug rule: lowercase ASCII alphanumerics with hyphens, 1-80 chars.
// Mirrored on the DB side via `categories.slug TEXT UNIQUE` (raw constraint),
// the regex enforces URL-safety here so we don't need a normaliser later.
export const SlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters / digits / hyphens only");

// ---------- categories ----------

export const CategoryCreateSchema = z.object({
  slug: SlugSchema,
  name_ja: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  name_tl: z.string().min(1).max(100),
  icon: z.string().max(50).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
export type CategoryCreateInput = z.infer<typeof CategoryCreateSchema>;

// PATCH allows partial updates. Slug is editable but constrained.
export const CategoryUpdateSchema = z.object({
  slug: SlugSchema.optional(),
  name_ja: z.string().min(1).max(100).optional(),
  name_en: z.string().min(1).max(100).optional(),
  name_tl: z.string().min(1).max(100).optional(),
  icon: z.string().max(50).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
export type CategoryUpdateInput = z.infer<typeof CategoryUpdateSchema>;

// ---------- shared helpers ----------

// JIS X 0401 (`JP-NN`). Used for prefecture-scoped articles, faqs, experts.
export const PrefectureCodeSchema = z
  .string()
  .regex(/^JP-\d{2}$/, "expected JP-NN (e.g. JP-13)");

const ArticleStatusEnum = z.enum(["draft", "published", "archived"]);

// ---------- articles ----------

export const ArticleCreateSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  slug: SlugSchema,
  status: ArticleStatusEnum.optional(), // defaults DB-side to 'draft'
  title_ja: z.string().min(1).max(200),
  title_en: z.string().max(200).nullable().optional(),
  title_tl: z.string().max(200).nullable().optional(),
  body_ja: z.string().min(1).max(50_000),
  body_en: z.string().max(50_000).nullable().optional(),
  body_tl: z.string().max(50_000).nullable().optional(),
  prefecture_code: PrefectureCodeSchema.nullable().optional(),
  city_name: z.string().max(100).nullable().optional(),
});
export type ArticleCreateInput = z.infer<typeof ArticleCreateSchema>;

export const ArticleUpdateSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  slug: SlugSchema.optional(),
  status: ArticleStatusEnum.optional(),
  title_ja: z.string().min(1).max(200).optional(),
  title_en: z.string().max(200).nullable().optional(),
  title_tl: z.string().max(200).nullable().optional(),
  body_ja: z.string().min(1).max(50_000).optional(),
  body_en: z.string().max(50_000).nullable().optional(),
  body_tl: z.string().max(50_000).nullable().optional(),
  prefecture_code: PrefectureCodeSchema.nullable().optional(),
  city_name: z.string().max(100).nullable().optional(),
});
export type ArticleUpdateInput = z.infer<typeof ArticleUpdateSchema>;

// Whitelist of fields the admin list can sort on. Prevents SQL injection
// via the `?sort=` query param and keeps the list endpoint deterministic.
export const ArticleListQuerySchema = z.object({
  status: ArticleStatusEnum.optional(),
  category_id: z.string().uuid().optional(),
});
