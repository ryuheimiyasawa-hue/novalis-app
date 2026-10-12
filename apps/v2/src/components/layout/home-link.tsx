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
}: {
  locale: "ja" | "en" | "tl";
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: "chat.ui" });
  return (
    <Link
      href={`/${locale}/dashboard`}
      className={`inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/40 ${className}`}
    >
      <HomeIcon className="size-4" aria-hidden />
      {t("backToDashboard")}
    </Link>
  );
}
