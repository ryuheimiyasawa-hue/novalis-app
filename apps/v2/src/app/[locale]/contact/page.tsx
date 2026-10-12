import Link from "next/link";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { HomeIcon, InfoIcon, MailIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { ContactForm, type ContactFormLabels } from "./contact-form";

// Contact page (P2-M, Feature A). First-party inquiry form that writes to
// the `inquiries` table via /api/inquiries, replacing the earlier Google
// Form embed. Submissions land in the admin inbox (/admin/inquiries).
//
// Anonymous beta testers (and logged-out visitors) cannot write to the
// inbox — migrations 007/008 block anon inserts on purpose — so for them
// we show the email fallback instead of the form.

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function ContactPage({ params }: PageProps) {
  const { locale } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as "ja" | "en" | "tl";
  setRequestLocale(safeLocale);

  const t = await getTranslations({ locale: safeLocale, namespace: "contact" });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canSubmit = !!user && user.is_anonymous !== true;

  const labels: ContactFormLabels = {
    subjectLabel: t("form.subjectLabel"),
    subjectPlaceholder: t("form.subjectPlaceholder"),
    messageLabel: t("form.messageLabel"),
    messagePlaceholder: t("form.messagePlaceholder"),
    emailLabel: t("form.emailLabel"),
    emailPlaceholder: t("form.emailPlaceholder"),
    submit: t("form.submit"),
    submitting: t("form.submitting"),
    success: t("form.success"),
    errorInvalid: t("form.errorInvalid"),
    errorGeneric: t("form.errorGeneric"),
  };

  return (
    <main id="main-content" className="mx-auto w-full max-w-[728px] flex-1 px-4 py-10 md:px-6 md:py-16">
      <div className="mb-8">
        <Link
          href={`/${safeLocale}/dashboard`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-input bg-card px-3.5 text-sm font-medium text-foreground shadow-xs transition-colors hover:border-primary/40 hover:bg-accent md:min-h-9"
        >
          <HomeIcon className="size-4" strokeWidth={1.75} aria-hidden />
          {t("backToDashboard")}
        </Link>
      </div>
      <PageHeader icon={MailIcon} title={t("title")} description={t("subtitle")} />

      {canSubmit ? (
        <div className="rounded-lg border border-border bg-card p-5 shadow-card md:p-8">
          <ContactForm labels={labels} defaultEmail={user?.email ?? undefined} />
        </div>
      ) : (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-highlight/40 bg-highlight-soft p-5 text-base text-foreground"
        >
          <InfoIcon className="mt-1 size-5 shrink-0 text-highlight-soft-foreground" strokeWidth={1.75} aria-hidden />
          <p>{t("form.anonNotice")}</p>
        </div>
      )}

      {/* Email fallback, always available beneath the form. */}
      <p className="mt-6 rounded-lg border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
        {t("emailFallbackLabel")}{" "}
        <a
          href="mailto:ryuhei.miyasawa@novalisgroup.biz"
          className="font-medium break-all text-primary underline underline-offset-4 hover:text-primary-hover"
        >
          ryuhei.miyasawa@novalisgroup.biz
        </a>
      </p>
    </main>
  );
}
