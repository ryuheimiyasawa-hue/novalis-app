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
    "inline-flex min-h-11 min-w-11 items-center text-sm text-footer-muted underline-offset-4 transition-colors hover:text-footer-foreground hover:underline lg:min-h-8";

  return (
    <footer data-surface="brand" className="mt-auto bg-footer text-footer-foreground">
      <div className="mx-auto grid max-w-[1120px] gap-10 px-4 py-12 md:grid-cols-[1.6fr_1fr_1fr] md:px-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="flex flex-col leading-tight">
              <span className="font-display text-lg font-extrabold tracking-wide">
                {tDash("headerLogo")}
              </span>
              <span className="text-xs text-footer-muted">{tApp("name")}</span>
            </span>
          </div>
          <p className="text-sm text-footer-muted">{tApp("tagline")}</p>
          <p className="text-sm font-bold">{t("operator")}</p>
          <p className="text-sm text-footer-muted">{t("languages")}</p>
          <p className="max-w-md text-xs text-footer-muted">{t("note")}</p>
        </div>

        <nav aria-label={t("serviceHeading")}>
          <p className="kicker mb-2 text-highlight">{t("serviceHeading")}</p>
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
          <p className="kicker mb-2 text-highlight">{t("legalHeading")}</p>
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
