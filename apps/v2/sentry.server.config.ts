// Server-runtime Sentry init. Minimal setup for B-4 dev verification;
// PII scrubbing, user_id tagging, and breadcrumb tuning are tracked for B-7.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    debug: false,
  });
}
