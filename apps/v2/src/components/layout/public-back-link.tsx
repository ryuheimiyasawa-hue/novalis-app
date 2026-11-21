import { getTranslations } from "next-intl/server";
import { BackLink } from "./back-link";

// Server wrapper that hands BackLink its translated labels, so the public
// pages stay one-liners: <PublicBackLink locale={safeLocale} />.
export async function PublicBackLink({
  locale,
  tone = "brand",
  className,
}: {
  locale: "ja" | "en" | "tl";
  tone?: "brand" | "button";
  className?: string;
}) {
  const tCommon = await getTranslations({ locale, namespace: "common" });
  const tChat = await getTranslations({ locale, namespace: "chat.ui" });
  return (
    <BackLink
      locale={locale}
      tone={tone}
      className={className}
      homeLabel={tCommon("backHome")}
      dashboardLabel={tChat("backToDashboard")}
    />
  );
}
