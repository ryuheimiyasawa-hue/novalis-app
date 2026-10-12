import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { redirect } from "next/navigation";
import { routing } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { KeyRoundIcon } from "lucide-react";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { IconTile } from "@/components/layout/icon-tile";
import { ResetPasswordForm } from "./reset-form";

// /[locale]/reset-password — landing page after a user clicks the
// recovery email link. Their session is already established by the
// /api/auth/callback handler (which detects type=recovery and redirects
// here); this page just exposes the password form.
//
// Hard rule: if no recovery session is active, kick the user back to
// /login. We do NOT want this page to be reachable directly — that
// would let anyone open it and try to set a password without proof of
// recovery email ownership.

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function ResetPasswordPage({ params }: Props) {
  const { locale } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as "ja" | "en" | "tl";
  setRequestLocale(safeLocale);

  // Gate: only allow this page when a recovery session is active.
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    redirect(`/${safeLocale}/login`);
  }

  const t = await getTranslations({
    locale: safeLocale,
    namespace: "resetPassword",
  });
  const tCommon = await getTranslations({
    locale: safeLocale,
    namespace: "common",
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        locale={safeLocale}
        mobileNav={false}
        switcher={
          <LocaleSwitcher
            currentLocale={safeLocale}
            label={tCommon("language")}
          />
        }
      />
      <main id="main-content" className="flex flex-1 items-start justify-center px-4 py-10 md:px-6 md:py-16">
        <div className="w-full max-w-[460px] space-y-6 rounded-lg border border-border bg-card p-6 shadow-card md:p-8">
          <div className="space-y-3">
            <IconTile icon={KeyRoundIcon} />
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-base text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <ResetPasswordForm
            locale={safeLocale}
            labels={{
              newPasswordPlaceholder: t("newPasswordPlaceholder"),
              confirmPasswordPlaceholder: t("confirmPasswordPlaceholder"),
              submit: t("submit"),
              submitting: t("submitting"),
              successMessage: t("successMessage"),
              mismatch: t("mismatch"),
              tooShort: t("tooShort"),
              failed: t("failed"),
            }}
          />
        </div>
      </main>
      <SiteFooter locale={safeLocale} />
    </div>
  );
}
