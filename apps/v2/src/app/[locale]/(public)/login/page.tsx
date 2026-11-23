import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { cookies } from "next/headers";
import { routing } from "@/lib/i18n/routing";
import { validateRedirect } from "@/lib/auth/redirect-validator";
import {
  LOGIN_FAILURE_COOKIE,
  parseFailureCount,
} from "@/lib/auth/login-failure-cookie";
import { LoginForm } from "./login-form";
import { EmailPasswordForm } from "./email-password-form";
import { ErrorBanner } from "./error-banner";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  setRequestLocale(safeLocale);

  const t = await getTranslations({ locale: safeLocale, namespace: "login" });
  const tApp = await getTranslations({ locale: safeLocale, namespace: "app" });

  const search = await searchParams;
  const safeRedirect = validateRedirect(search.redirect);
  if (search.redirect && !safeRedirect) {
    console.warn("[login] rejected suspicious redirect:", search.redirect);
  }

  const errorCode =
    search.error === "fb_denied" ||
    search.error === "fb_no_email" ||
    search.error === "fb_failed" ||
    search.error === "callback_failed"
      ? search.error
      : undefined;

  const cookieStore = await cookies();
  const failureCount = parseFailureCount(
    cookieStore.get(LOGIN_FAILURE_COOKIE)?.value,
  );

  return (
    <main id="main-content" className="w-full">
      <div data-surface="brand" className="mb-5 space-y-2 text-primary-foreground">
        <p className="kicker text-highlight">{tApp("name")}</p>
        <h1 className="text-3xl">{t("heading")}</h1>
        <p className="text-base text-primary-foreground/90">{t("subheading")}</p>
      </div>
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-card md:p-8">

        <ErrorBanner errorCode={errorCode} failureCount={failureCount} locale={safeLocale} />

        <LoginForm
          locale={safeLocale}
          redirect={safeRedirect}
          buttonLabel={t("facebookButton")}
        />

        <div className="flex items-center gap-3 font-display text-sm font-bold text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>{t("orDivider")}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <EmailPasswordForm
          locale={safeLocale}
          redirect={safeRedirect}
          labels={{
            emailPlaceholder: t("emailPlaceholder"),
            passwordPlaceholder: t("passwordPlaceholder"),
            signIn: t("signIn"),
            signUp: t("signUp"),
            signingIn: t("signingIn"),
            signingUp: t("signingUp"),
            signInFailed: t("signInFailed"),
            signUpFailed: t("signUpFailed"),
            signUpAlreadyRegistered: t("signUpAlreadyRegistered"),
            signUpRateLimited: t("signUpRateLimited"),
            signUpEmailSent: t("signUpEmailSent"),
            signUpInstantSuccess: t("signUpInstantSuccess"),
            passwordTooShort: t("passwordTooShort"),
            forgotPassword: t("forgotPassword"),
            resetEmailSent: t("resetEmailSent"),
            resetFailed: t("resetFailed"),
            resetTitle: t("resetTitle"),
            resetSubmit: t("resetSubmit"),
            resetCancel: t("resetCancel"),
          }}
        />


        <div className="border-t border-border pt-5 text-center text-sm text-muted-foreground">
          <p>
            {t("supportText")}{" "}
            <a
              href="mailto:ryuhei.miyasawa@novalisgroup.biz"
              className="font-medium text-primary underline underline-offset-4 hover:text-primary-hover"
            >
              {t("supportLink")}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
