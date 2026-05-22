"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { routing } from "@/lib/i18n/routing";
import { localeLabels } from "@/lib/i18n/config";
import { setPreferredLanguageCookie } from "@/lib/i18n/preferred-language-cookie";

// Shared locale switcher used on every page that doesn't already have a
// custom one (dashboard / login still use their page-specific variants).
// Rewrites only the locale segment of the current pathname; preserves
// the query string verbatim so OAuth state / pagination / chat
// conversation_id survive a language flip. Persists the choice as a
// cookie so server components see it on the next render.
//
// IMPORTANT: useSearchParams() forces a Suspense boundary at the
// nearest server component (Next.js prerender requirement). Without
// the inner-wrap pattern below, statically-prerendered routes
// (/ja/legal/*, /ja/articles, etc.) fail the build with:
//   "useSearchParams() should be wrapped in a suspense boundary".
// The exported LocaleSwitcher handles this so callers can just drop
// it into their page tree without thinking about Suspense.

interface Props {
  currentLocale: string;
  /** Localised "Language:" / "言語:" / "Wika:" label. Pass via i18n. */
  label: string;
  /** Tailwind class overrides for the wrapper. Default mirrors the
   *  dashboard switcher's text-sm muted look. */
  className?: string;
}

function LocaleSwitcherInner({ currentLocale, label, className }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function buildHref(targetLocale: string): string {
    const segments = pathname.split("/");
    if (
      segments.length > 1 &&
      (routing.locales as readonly string[]).includes(segments[1])
    ) {
      segments[1] = targetLocale;
    }
    const newPath = segments.join("/") || "/";
    const query = searchParams.toString();
    return query ? `${newPath}?${query}` : newPath;
  }

  function rememberChoice(target: string) {
    setPreferredLanguageCookie(target as "ja" | "en" | "tl");
  }

  return (
    <span className={className ?? "text-sm"}>
      <span className="mr-2 text-neutral-500">{label}:</span>
      {routing.locales.map((loc, i) => (
        <span key={loc}>
          {i > 0 && <span className="mx-1 text-neutral-400">·</span>}
          {loc === currentLocale ? (
            <span className="font-medium underline">{localeLabels[loc]}</span>
          ) : (
            <Link
              href={buildHref(loc)}
              onClick={() => rememberChoice(loc)}
              className="hover:underline"
            >
              {localeLabels[loc]}
            </Link>
          )}
        </span>
      ))}
    </span>
  );
}

export function LocaleSwitcher(props: Props) {
  // Suspense boundary required for prerender — see file header comment.
  // Fallback is null because the switcher is supplementary UI; pages
  // render fully without it during the brief hydration window.
  return (
    <Suspense fallback={null}>
      <LocaleSwitcherInner {...props} />
    </Suspense>
  );
}
