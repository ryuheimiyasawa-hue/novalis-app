// Pure helpers used by /api/admin/categories to refuse destructive
// operations against seed (system) categories. They live outside the
// route handlers so the rules stay unit-testable without mocking
// Supabase. The route is the only caller.
//
// Why we protect: the 7 seed categories drive AI chat routing, the
// public navigation, and several hardcoded references. Losing or
// renaming any of them silently breaks core product behavior.

export interface SystemCategoryTarget {
  slug: string;
  is_system: boolean;
}

export type SystemGuardResult =
  | { ok: true }
  | { ok: false; reason: "delete_blocked" | "slug_rename_blocked" };

export function checkDeleteAllowed(
  target: SystemCategoryTarget,
): SystemGuardResult {
  if (target.is_system) return { ok: false, reason: "delete_blocked" };
  return { ok: true };
}

export function checkSlugRenameAllowed(
  target: SystemCategoryTarget,
  nextSlug: string | undefined,
): SystemGuardResult {
  // No slug change requested -> always allowed.
  if (nextSlug === undefined) return { ok: true };
  // Same slug -> no-op rename, allowed.
  if (nextSlug === target.slug) return { ok: true };
  if (target.is_system) return { ok: false, reason: "slug_rename_blocked" };
  return { ok: true };
}
