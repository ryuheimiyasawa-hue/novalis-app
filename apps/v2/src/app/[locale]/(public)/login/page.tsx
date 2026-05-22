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
import { LanguageSwitcher } from "./language-switcher";

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
    search.error === "fb_failed" ||
    search.error === "callback_failed"
      ? search.error
      : undefined;

  const cookieStore = await cookies();
  const failureCount = parseFailureCount(
    cookieStore.get(LOGIN_FAILURE_COOKIE)?.value,
  );

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest text-neutral-500">
            {tApp("name")}
          </p>
          <h1 className="text-3xl font-bold">{t("heading")}</h1>
          <p className="text-neutral-600 dark:text-neutral-300">{t("subheading")}</p>
        </div>

        <ErrorBanner errorCode={errorCode} failureCount={failureCount} locale={safeLocale} />

        <LoginForm
          locale={safeLocale}
          redirect={safeRedirect}
          buttonLabel={t("facebookButton")}
        />

        <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          <span>{t("orDivider")}</span>
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
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

        <div className="text-center text-sm text-neutral-500 space-y-2">
          <p>
            {t("supportText")}{" "}
            <a
              href="mailto:ryuhei.miyasawa@novalisgroup.biz"
              className="underline hover:text-neutral-700"
            >
              {t("supportLink")}
            </a>
          </p>
          <LanguageSwitcher
            currentLocale={safeLocale}
            label={t("switchLanguage")}
          />
        </div>
      </div>
    </main>
  );
}
