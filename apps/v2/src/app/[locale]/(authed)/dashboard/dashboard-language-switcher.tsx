"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { routing } from "@/lib/i18n/routing";
import { setPreferredLanguageCookie } from "@/lib/i18n/preferred-language-cookie";
import { LocalePills } from "@/components/i18n/locale-pills";

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
    <LocalePills
      currentLocale={currentLocale}
      label={label}
      hrefFor={buildHref}
      onPick={rememberChoice}
    />
  );
}
