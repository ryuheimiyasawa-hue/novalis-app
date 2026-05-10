import { z } from "zod";

// Slug rule: lowercase ASCII alphanumerics with hyphens or underscores,
// 1-80 chars. The legacy seed categories (social_ins, admin_proc) use
// underscores, so accepting both keeps the public API able to filter on
// what is actually stored. Kebab-case is preferred for new slugs but the
// schema does not enforce it — operators can rename later if we want a
// uniform style.
//
// Constraint: slugs cannot start or end with a separator and cannot
// contain consecutive separators. Mixed _ and - in the same slug is
// allowed (e.g. social_ins-2024).
export const SlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/,
    "lowercase letters / digits, separated by single hyphen or underscore",
  );

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

// ---------- faqs ----------

// FAQs are scoped by category and surfaced as Q/A pairs. Answers are
// plain text (not markdown) — the public UI renders with whitespace
// preservation, no rich formatting needed.
export const FaqCreateSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  question_ja: z.string().min(1).max(500),
  question_en: z.string().max(500).nullable().optional(),
  question_tl: z.string().max(500).nullable().optional(),
  answer_ja: z.string().min(1).max(10_000),
  answer_en: z.string().max(10_000).nullable().optional(),
  answer_tl: z.string().max(10_000).nullable().optional(),
  prefecture_code: PrefectureCodeSchema.nullable().optional(),
  is_published: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
export type FaqCreateInput = z.infer<typeof FaqCreateSchema>;

export const FaqUpdateSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  question_ja: z.string().min(1).max(500).optional(),
  question_en: z.string().max(500).nullable().optional(),
  question_tl: z.string().max(500).nullable().optional(),
  answer_ja: z.string().min(1).max(10_000).optional(),
  answer_en: z.string().max(10_000).nullable().optional(),
  answer_tl: z.string().max(10_000).nullable().optional(),
  prefecture_code: PrefectureCodeSchema.nullable().optional(),
  is_published: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
export type FaqUpdateInput = z.infer<typeof FaqUpdateSchema>;

// Coerce 'true' / 'false' query strings into booleans so the URL filter
// stays human-typeable.
export const FaqListQuerySchema = z.object({
  category_id: z.string().uuid().optional(),
  is_published: z.enum(["true", "false"]).optional(),
});

// ---------- experts ----------

// External URLs are restricted to https — calendar_url ends up rendered
// as an `href` for booking, so we refuse data:/javascript: schemes that
// could ride along.
const HttpsUrlSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith("https://"), "must be https://");

export const ExpertCreateSchema = z.object({
  name: z.string().min(1).max(100),
  title: z.string().min(1).max(100),
  specialty_ja: z.string().max(500).nullable().optional(),
  specialty_en: z.string().max(500).nullable().optional(),
  specialty_tl: z.string().max(500).nullable().optional(),
  bio_ja: z.string().max(5_000).nullable().optional(),
  bio_en: z.string().max(5_000).nullable().optional(),
  bio_tl: z.string().max(5_000).nullable().optional(),
  prefecture_code: PrefectureCodeSchema.nullable().optional(),
  city_name: z.string().max(100).nullable().optional(),
  avatar_url: HttpsUrlSchema.nullable().optional(),
  calendar_url: HttpsUrlSchema.nullable().optional(),
  is_active: z.boolean().optional(),
});
export type ExpertCreateInput = z.infer<typeof ExpertCreateSchema>;

export const ExpertUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(100).optional(),
  specialty_ja: z.string().max(500).nullable().optional(),
  specialty_en: z.string().max(500).nullable().optional(),
  specialty_tl: z.string().max(500).nullable().optional(),
  bio_ja: z.string().max(5_000).nullable().optional(),
  bio_en: z.string().max(5_000).nullable().optional(),
  bio_tl: z.string().max(5_000).nullable().optional(),
  prefecture_code: PrefectureCodeSchema.nullable().optional(),
  city_name: z.string().max(100).nullable().optional(),
  avatar_url: HttpsUrlSchema.nullable().optional(),
  calendar_url: HttpsUrlSchema.nullable().optional(),
  is_active: z.boolean().optional(),
});
export type ExpertUpdateInput = z.infer<typeof ExpertUpdateSchema>;

export const ExpertListQuerySchema = z.object({
  prefecture_code: PrefectureCodeSchema.optional(),
  is_active: z.enum(["true", "false"]).optional(),
});
