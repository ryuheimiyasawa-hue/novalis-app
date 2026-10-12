"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { routing } from "@/lib/i18n/routing";
import { LocalePills } from "@/components/i18n/locale-pills";

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
    <LocalePills
      currentLocale={currentLocale}
      label={label}
      hrefFor={buildHref}
    />
  );
}
