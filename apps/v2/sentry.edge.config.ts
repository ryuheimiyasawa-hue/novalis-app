// Edge-runtime Sentry init (used by middleware/proxy and edge route handlers).
// beforeSend redacts PII from every event. No-op until SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry/scrub";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    debug: false,
    beforeSend: (event) => scrubEvent(event),
  });
}
