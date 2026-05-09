"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { routing } from "@/lib/i18n/routing";
import { localeLabels } from "@/lib/i18n/config";
import { setPreferredLanguageCookie } from "@/lib/i18n/preferred-language-cookie";

interface Props {
  currentLocale: string;
  label: string;
}

// Header language switcher used on the dashboard.
// Rewrites only the locale segment of the current pathname; preserves the
// query string verbatim. Persists the choice as a cookie so server
// components (incl. the onboarding welcome modal) can observe it.

export function DashboardLanguageSwitcher({ currentLocale, label }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function buildHref(targetLocale: string): string {
    const segments = pathname.split("/");
    if (segments.length > 1 && (routing.locales as readonly string[]).includes(segments[1])) {
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
    <span className="text-sm">
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
