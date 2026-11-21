import Link from "next/link";
import { HomeIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

// One way back. Every page below the dashboard carried its own idea of a
// back link — an icon with no label in the chat header, a text link on
// some pages, nothing at all on the article and restaurant pages — so a
// reader who followed a link in had no consistent way out.
//
// Rendered at the top of the page content, before the heading, in the
// same shape everywhere: house icon plus the wording the dashboard uses.
export async function HomeLink({
  locale,
  className = "",
  tone = "button",
}: {
  locale: "ja" | "en" | "tl";
  className?: string;
  /** "button": outlined pill (default). "brand": a small white text link
   *  for the top of a blue page band. */
  tone?: "button" | "brand";
}) {
  const t = await getTranslations({ locale, namespace: "chat.ui" });
  const look =
    tone === "brand"
      ? "inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary-foreground/90 underline-offset-4 hover:text-primary-foreground hover:underline lg:min-h-8"
      : "inline-flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-4 font-display text-sm font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-accent lg:min-h-9";
  return (
    <Link href={`/${locale}/dashboard`} className={`${look} ${className}`}>
      <HomeIcon className="size-4" strokeWidth={1.75} aria-hidden />
      {t("backToDashboard")}
    </Link>
  );
}
