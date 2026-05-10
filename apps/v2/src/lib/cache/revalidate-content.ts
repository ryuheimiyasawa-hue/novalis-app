import { revalidatePath } from "next/cache";
import { routing } from "@/lib/i18n/routing";

// Cache invalidation called from admin write endpoints after a successful
// mutation. The corresponding public pages do not exist yet (W4+), so
// these are no-ops in the short term — but wiring them in now means
// future page additions inherit invalidation for free.
//
// Each helper iterates the configured locales (ja / en / tl). Calls are
// idempotent and cheap; per-slug paths are best-effort and skipped when
// the route can't reasonably know the slug (e.g. DELETE that doesn't
// fetch the row first). Index pages are always invalidated, so a stale
// list view is at most one render behind reality.

export function revalidateArticles(opts?: {
  slug?: string;
  categorySlug?: string;
}) {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/articles`);
    if (opts?.slug) revalidatePath(`/${locale}/articles/${opts.slug}`);
    if (opts?.categorySlug)
      revalidatePath(`/${locale}/categories/${opts.categorySlug}`);
  }
}

export function revalidateFaqs(opts?: { categorySlug?: string }) {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/faqs`);
    if (opts?.categorySlug)
      revalidatePath(`/${locale}/categories/${opts.categorySlug}`);
  }
}

export function revalidateExperts() {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/experts`);
  }
}

// Category mutations affect every list (articles + faqs are filtered by
// category), so we invalidate both index pages plus the category-scoped
// page when we know the slug.
export function revalidateCategories(opts?: { slug?: string }) {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/articles`);
    revalidatePath(`/${locale}/faqs`);
    if (opts?.slug) revalidatePath(`/${locale}/categories/${opts.slug}`);
  }
}
