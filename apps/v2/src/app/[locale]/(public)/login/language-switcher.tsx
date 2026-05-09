"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { routing } from "@/lib/i18n/routing";
import { localeLabels } from "@/lib/i18n/config";

interface Props {
  currentLocale: string;
  label: string;
}

// Mini language switcher used on the login page only.
// Preserves the existing query string (?error=, ?redirect=) when the user
// changes locale, so OAuth state and pending error context survive a
// language switch (W2 補足指示 D).
export function LanguageSwitcher({ currentLocale, label }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function buildHref(targetLocale: string): string {
    const segments = pathname.split("/");
    if (segments.length > 1 && routing.locales.includes(segments[1] as never)) {
      segments[1] = targetLocale;
    }
    const newPath = segments.join("/") || "/";
    const query = searchParams.toString();
    return query ? `${newPath}?${query}` : newPath;
  }

  return (
    <p>
      <span className="mr-2 text-neutral-500">{label}:</span>
      {routing.locales.map((loc, i) => (
        <span key={loc}>
          {i > 0 && <span className="mx-1 text-neutral-400">·</span>}
          {loc === currentLocale ? (
            <span className="font-medium underline">{localeLabels[loc]}</span>
          ) : (
            <Link href={buildHref(loc)} className="hover:underline">
              {localeLabels[loc]}
            </Link>
          )}
        </span>
      ))}
    </p>
  );
}
