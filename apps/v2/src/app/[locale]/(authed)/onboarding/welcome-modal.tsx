"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="max-w-sm w-full rounded-md bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-lg">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold">{t("heading")}</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {t("subheading")}
          </p>
        </div>
        <div className="grid gap-2">
          {(["ja", "en", "tl"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => persistAndDismiss(lang)}
              className="w-full px-4 py-3 rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-left"
            >
              {t(lang)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => persistAndDismiss(currentLocale)}
          className="w-full text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          {t("skip")}
        </button>
      </div>
    </div>
  );
}
