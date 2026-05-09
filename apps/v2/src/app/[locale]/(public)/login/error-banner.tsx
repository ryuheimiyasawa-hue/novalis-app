import { getTranslations } from "next-intl/server";

const MESSAGE_KEY: Record<string, "fbDenied" | "fbFailed" | "callbackFailed"> = {
  fb_denied: "fbDenied",
  fb_failed: "fbFailed",
  callback_failed: "callbackFailed",
};

export const MAX_BEFORE_SUPPORT = 3;

interface Props {
  errorCode?: string;
  failureCount: number;
  locale: string;
}

// Server-rendered banner. Failure count is sourced from a server-managed
// HttpOnly cookie (set by /api/auth/callback on each failure, cleared on
// success) so we can render the support CTA without client state.
export async function ErrorBanner({ errorCode, failureCount, locale }: Props) {
  if (!errorCode) return null;
  const t = await getTranslations({ locale, namespace: "loginErrors" });
  const messageKey = MESSAGE_KEY[errorCode] ?? "fbFailed";
  const exceeded = failureCount >= MAX_BEFORE_SUPPORT;

  return (
    <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200">
      <p>{t(messageKey)}</p>
      {exceeded && (
        <p className="mt-2">
          {t("tooManyAttempts")}{" "}
          <a
            href="mailto:contact@novalis.ph"
            className="underline font-medium"
          >
            contact@novalis.ph
          </a>
        </p>
      )}
    </div>
  );
}
