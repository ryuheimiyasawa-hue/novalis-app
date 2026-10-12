import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "./brand-mark";

// Shared footer: who runs the service, what the AI is (and is not), the
// three languages, and the policy / contact links every page must carry.
export async function SiteFooter({ locale }: { locale: "ja" | "en" | "tl" }) {
  const t = await getTranslations({ locale, namespace: "footer" });
  const tNav = await getTranslations({ locale, namespace: "nav" });
  const tApp = await getTranslations({ locale, namespace: "app" });
  const tDash = await getTranslations({ locale, namespace: "dashboard" });

  const linkClass =
    "inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline md:min-h-8";

  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="mx-auto grid max-w-[1120px] gap-10 px-4 py-12 md:grid-cols-[1.6fr_1fr_1fr] md:px-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold">{tDash("headerLogo")}</span>
              <span className="text-xs text-muted-foreground">{tApp("name")}</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{tApp("tagline")}</p>
          <p className="text-sm font-medium text-foreground">{t("operator")}</p>
          <p className="text-sm text-muted-foreground">{t("languages")}</p>
          <p className="max-w-md text-xs text-muted-foreground">{t("note")}</p>
        </div>

        <nav aria-label={t("serviceHeading")}>
          <p className="mb-2 text-sm font-bold">{t("serviceHeading")}</p>
          <ul>
            <li>
              <Link href={`/${locale}/articles`} className={linkClass}>
                {tNav("articles")}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/restaurants`} className={linkClass}>
                {tNav("restaurants")}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/contact`} className={linkClass}>
                {tNav("contact")}
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label={t("legalHeading")}>
          <p className="mb-2 text-sm font-bold">{t("legalHeading")}</p>
          <ul>
            <li>
              <Link href={`/${locale}/legal/terms`} className={linkClass}>
                {tDash("footerTerms")}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/legal/privacy`} className={linkClass}>
                {tDash("footerPrivacy")}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
