"use client";

import Link from "next/link";
import { LanguagesIcon } from "lucide-react";
import { routing } from "@/lib/i18n/routing";
import { localeLabels } from "@/lib/i18n/config";
import { cn } from "@/lib/utils/cn";

// Presentation shared by every language switcher (the generic one, the
// dashboard one and the login one). The three languages sit side by side
// as equals in a segmented pill; each switcher keeps its own href
// building and side effects and passes them in. Inside the blue header
// ([data-surface="brand"]) it turns into a white-outlined pill with the
// current language on white.
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
      {/* The visible "Language" word needs room, so it shows from lg up;
          the icon carries the meaning from sm up, and the list keeps the
          word as its accessible name at every width. Phones at 360px have
          no space for either beside the logo. */}
      <span className="hidden items-center gap-1.5 text-sm text-muted-foreground in-data-[surface=brand]:text-primary-foreground/85 sm:inline-flex">
        <LanguagesIcon className="size-4" strokeWidth={1.75} aria-hidden />
        <span className="hidden lg:inline">{label}</span>
      </span>
      <ul
        aria-label={label}
        className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5 in-data-[surface=brand]:border-primary-foreground/70 in-data-[surface=brand]:bg-transparent"
      >
        {routing.locales.map((loc) => {
          const isCurrent = loc === currentLocale;
          const pill =
            "inline-flex min-h-11 items-center justify-center rounded-full px-2.5 font-display text-sm font-bold whitespace-nowrap sm:px-3 lg:min-h-8";
          return (
            <li key={loc}>
              {isCurrent ? (
                <span
                  aria-current="true"
                  lang={loc}
                  className={cn(
                    pill,
                    "bg-primary text-primary-foreground in-data-[surface=brand]:bg-card in-data-[surface=brand]:text-primary",
                  )}
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
                    "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground in-data-[surface=brand]:text-primary-foreground in-data-[surface=brand]:hover:bg-primary-hover",
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
