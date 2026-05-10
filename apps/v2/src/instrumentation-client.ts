// Browser-runtime Sentry init.
// Per Sentry Next.js 10 SDK, this file (or sentry.client.config.ts) is
// auto-discovered by the Sentry webpack plugin from withSentryConfig.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    debug: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
