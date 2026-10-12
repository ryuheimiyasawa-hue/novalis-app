"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { routing } from "@/lib/i18n/routing";
import { setPreferredLanguageCookie } from "@/lib/i18n/preferred-language-cookie";
import { LocalePills } from "./locale-pills";

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
  /** Extra classes for the wrapper (layout only — the look is shared
   *  through LocalePills). */
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
    <LocalePills
      currentLocale={currentLocale}
      label={label}
      hrefFor={buildHref}
      onPick={rememberChoice}
      className={className}
    />
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
