import { CircleAlertIcon } from "lucide-react";
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
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground"
    >
      <CircleAlertIcon className="mt-0.5 size-5 shrink-0 text-destructive" strokeWidth={1.75} aria-hidden />
      <div>
      <p className="font-medium text-destructive">{t(messageKey)}</p>
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
    </div>
  );
}
