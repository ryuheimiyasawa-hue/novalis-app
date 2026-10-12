"use client";

import Link from "next/link";
import { LanguagesIcon } from "lucide-react";
import { routing } from "@/lib/i18n/routing";
import { localeLabels } from "@/lib/i18n/config";
import { cn } from "@/lib/utils/cn";

// Presentation shared by every language switcher (the generic one, the
// dashboard one and the login one). The three languages sit side by side
// as equals in a segmented control; each switcher keeps its own href
// building and side effects and passes them in.
export function LocalePills({
  currentLocale,
  label,
  hrefFor,
  onPick,
  className,
}: {
  currentLocale: string;
  label: string;
  hrefFor: (locale: string) => string;
  onPick?: (locale: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="hidden items-center gap-1.5 text-sm text-muted-foreground lg:inline-flex">
        <LanguagesIcon className="size-4" strokeWidth={1.75} aria-hidden />
        {label}
      </span>
      <ul
        aria-label={label}
        className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5"
      >
        {routing.locales.map((loc) => {
          const isCurrent = loc === currentLocale;
          const pill =
            "inline-flex min-h-11 items-center justify-center rounded-[8px] px-2 text-sm font-medium whitespace-nowrap sm:px-2.5 md:min-h-8";
          return (
            <li key={loc}>
              {isCurrent ? (
                <span
                  aria-current="true"
                  lang={loc}
                  className={cn(pill, "bg-primary text-primary-foreground")}
                >
                  {localeLabels[loc]}
                </span>
              ) : (
                <Link
                  href={hrefFor(loc)}
                  onClick={onPick ? () => onPick(loc) : undefined}
                  lang={loc}
                  hrefLang={loc}
                  className={cn(
                    pill,
                    "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  )}
                >
                  {localeLabels[loc]}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
