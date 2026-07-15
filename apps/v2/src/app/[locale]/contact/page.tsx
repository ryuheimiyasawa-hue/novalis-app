import Link from "next/link";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
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
  const tCommon = await getTranslations({ locale: safeLocale, namespace: "common" });

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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={`/${safeLocale}/dashboard`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← {t("backToDashboard")}
        </Link>
        <LocaleSwitcher currentLocale={safeLocale} label={tCommon("language")} />
      </div>
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {canSubmit ? (
        <ContactForm labels={labels} defaultEmail={user?.email ?? undefined} />
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {t("form.anonNotice")}
        </div>
      )}

      {/* Email fallback, always available beneath the form. */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("emailFallbackLabel")}{" "}
        <a
          href="mailto:ryuhei.miyasawa@novalisgroup.biz"
          className="font-medium text-primary hover:underline"
        >
          ryuhei.miyasawa@novalisgroup.biz
        </a>
      </p>
    </main>
  );
}
