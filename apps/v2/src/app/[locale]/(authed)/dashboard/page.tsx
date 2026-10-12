import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { isPaymentEnabled } from "@/lib/payment/is-payment-enabled";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckIcon,
  FlaskConicalIcon,
  MessageCircleIcon,
  MessagesSquareIcon,
  UserRoundIcon,
} from "lucide-react";
import { DashboardLanguageSwitcher } from "./dashboard-language-switcher";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { IconTile } from "@/components/layout/icon-tile";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale)
    ? (locale as "ja" | "en" | "tl")
    : (routing.defaultLocale as "ja" | "en" | "tl");
  setRequestLocale(safeLocale);

  // Auth + onboarded are already enforced by proxy.ts and (authed) layout,
  // but we still need the user to look up the profile row.
  const user = await requireAuth();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const t = await getTranslations({
    locale: safeLocale,
    namespace: "dashboard",
  });
  const tAnon = await getTranslations({
    locale: safeLocale,
    namespace: "anonBanner",
  });
  const displayName = profile?.display_name ?? "";
  const isAnon = user.is_anonymous === true;

  const account = (
    <div className="flex items-center gap-3">
      {displayName && (
        <span className="inline-flex max-w-[12rem] items-center gap-2 truncate text-sm text-foreground">
          <UserRoundIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <span className="truncate">{displayName}</span>
        </span>
      )}
      <SignOutButton
        locale={safeLocale}
        label={t("signOut")}
        pendingLabel={t("signingOut")}
      />
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        locale={safeLocale}
        variant="app"
        active="dashboard"
        switcher={
          <DashboardLanguageSwitcher
            currentLocale={safeLocale}
            label={t("footerLanguage")}
          />
        }
        actions={<div className="hidden md:block">{account}</div>}
      />

      <main id="main-content" className="flex-1 px-4 py-10 md:px-6 md:py-16">
        <section className="mx-auto max-w-[1120px] space-y-10">
          {/* Account row for phones — the header has no room for it there. */}
          <div className="flex justify-end md:hidden">{account}</div>

          {isAnon && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-highlight/40 bg-highlight-soft px-4 py-3 text-sm text-foreground"
            >
              <FlaskConicalIcon className="mt-0.5 size-4 shrink-0 text-highlight-soft-foreground" strokeWidth={1.75} aria-hidden />
              <p>
                <span className="font-bold text-highlight-soft-foreground">{tAnon("label")}</span>
                <span className="mx-2" aria-hidden>·</span>
                <span>{tAnon("body")}</span>
              </p>
            </div>
          )}

          <div className="space-y-3">
            {!isPaymentEnabled() && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-highlight-soft px-3 py-1 text-sm font-medium text-highlight-soft-foreground">
                <CheckIcon className="size-4" strokeWidth={2} aria-hidden />
                {t("freeBadge")}
              </span>
            )}
            <h1 className="text-2xl font-bold md:text-3xl">
              {t("greeting", { name: displayName })}
            </h1>
            <p className="max-w-[680px] text-base text-muted-foreground">{t("lead")}</p>
          </div>

          {/* The one thing to do next: start a consultation. */}
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
            <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:gap-10 md:p-8">
              <div className="flex gap-4">
                <IconTile icon={MessagesSquareIcon} size="lg" className="hidden sm:inline-flex" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-primary">{t("nextStep")}</p>
                  <h2 className="text-2xl font-bold">{t("chatCtaTitle")}</h2>
                  <p className="max-w-[600px] text-base text-muted-foreground">
                    {t("chatCtaBody")}
                  </p>
                </div>
              </div>
              {/* "View past consultations" was previously a second CTA
                  here. Replaced by the always-visible sidebar inside
                  /chat itself (Phase 1 chat UX rework), so the dashboard
                  only needs the entry point now. */}
              <Button asChild size="lg" className="w-full md:w-auto">
                <Link href={`/${safeLocale}/chat`}>
                  {t("chatCtaButton")}
                  <ArrowRightIcon aria-hidden />
                </Link>
              </Button>
            </div>
            <div className="h-1 bg-highlight" aria-hidden />
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold">{t("moreHeading")}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-card">
                <IconTile icon={BookOpenIcon} tone="highlight" />
                <div className="flex-1 space-y-2">
                  <h3 className="text-xl font-bold">{t("articlesCtaTitle")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("articlesCtaBody")}
                  </p>
                </div>
                <Button asChild variant="outline" className="w-full sm:w-auto sm:self-start">
                  <Link href={`/${safeLocale}/articles`}>
                    {t("articlesCtaButton")}
                  </Link>
                </Button>
              </div>

              {/* Messenger linking is unavailable to anonymous beta sessions (the
                  link would be stranded when the session is purged), so the entry
                  point is hidden rather than shown and then refused. */}
              {!isAnon && (
                <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-card">
                  <IconTile icon={MessageCircleIcon} tone="highlight" />
                  <div className="flex-1 space-y-2">
                    <h3 className="text-xl font-bold">
                      {t("messengerCtaTitle")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("messengerCtaBody")}
                    </p>
                  </div>
                  <Button asChild variant="outline" className="w-full sm:w-auto sm:self-start">
                    <Link href={`/${safeLocale}/messenger`}>
                      {t("messengerCtaButton")}
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter locale={safeLocale} />
    </div>
  );
}
