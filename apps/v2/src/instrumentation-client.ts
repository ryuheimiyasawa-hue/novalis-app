// Browser-runtime Sentry init.
// Per Sentry Next.js 10 SDK, this file (or sentry.client.config.ts) is
// auto-discovered by the Sentry webpack plugin from withSentryConfig.
import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry/scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Replay stays disabled: it would capture DOM/text incl. user PII, and
    // beforeSend does not scrub replay payloads.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    debug: false,
    beforeSend: (event) => scrubEvent(event),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
