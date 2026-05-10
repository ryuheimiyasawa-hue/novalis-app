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
