"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRightIcon, LanguagesIcon } from "lucide-react";
import { routing } from "@/lib/i18n/routing";
import { setPreferredLanguageCookie } from "@/lib/i18n/preferred-language-cookie";

interface Props {
  currentLocale: "ja" | "en" | "tl";
  initialShow: boolean;
}

// Shown once on first onboarding visit. The decision to render is made on
// the server from the preferredLanguage cookie, then passed in via
// `initialShow` — no useEffect / setState-in-effect required. The choice
// is persisted as a cookie (not localStorage) so server components can
// observe it on subsequent visits.
export function WelcomeModal({ currentLocale, initialShow }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("welcomeModal");
  const [show, setShow] = useState(initialShow);

  function persistAndDismiss(language: "ja" | "en" | "tl") {
    setPreferredLanguageCookie(language);
    setShow(false);
    if (language !== currentLocale) {
      const segments = pathname.split("/");
      if (
        segments.length > 1 &&
        (routing.locales as readonly string[]).includes(segments[1])
      ) {
        segments[1] = language;
      }
      router.replace(segments.join("/") || "/");
    }
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
    >
      <div className="w-full max-w-sm space-y-5 rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="space-y-2 text-center">
          <span
            aria-hidden
            className="mx-auto inline-flex size-12 items-center justify-center rounded-md bg-primary-soft text-primary"
          >
            <LanguagesIcon className="size-6" strokeWidth={1.75} />
          </span>
          <h2 id="welcome-modal-heading" className="text-xl font-bold">{t("heading")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("subheading")}
          </p>
        </div>
        <div className="grid gap-2">
          {(["ja", "en", "tl"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => persistAndDismiss(lang)}
              lang={lang}
              className="flex min-h-12 w-full items-center justify-between rounded-md border border-input bg-card px-4 text-left text-base font-medium transition-colors hover:border-primary/40 hover:bg-accent"
            >
              {t(lang)}
              <ChevronRightIcon className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => persistAndDismiss(currentLocale)}
          className="inline-flex min-h-11 w-full items-center justify-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("skip")}
        </button>
      </div>
    </div>
  );
}
