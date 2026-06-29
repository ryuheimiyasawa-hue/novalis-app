// Server-runtime Sentry init. beforeSend redacts PII from every event so chat
// content (residence card numbers, My Number, phone, email) never reaches
// Sentry. No-op until SENTRY_DSN is set (production only).
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
