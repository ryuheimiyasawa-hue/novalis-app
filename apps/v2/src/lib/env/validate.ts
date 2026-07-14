import { z } from "zod";

const baseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  FACEBOOK_APP_ID: z.string().min(1),
  FACEBOOK_APP_SECRET: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  // Sentry is opt-in: when DSN is set the SDK initialises and reports;
  // when unset the init guards in sentry.{server,edge}.config.ts /
  // instrumentation-client.ts no-op. Keeping these optional unblocks
  // MVP demo deploy without forcing a Sentry project to exist first.
  // Phase 2 will flip these back to required once monitoring is on the
  // critical path (per Lesson 25 — silent persistence failure).
  SENTRY_DSN: z.string().min(1).optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().min(1).optional(),
  SENTRY_ORG: z.string().min(1).optional(),
  SENTRY_PROJECT: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(["ja", "en", "tl"]).default("ja"),
  NEXT_PUBLIC_PAYMENT_ENABLED: z.enum(["true", "false"]).default("false"),
  // Escalation cumulative-scoring controls (P2-L). Scaffolded now so the
  // audit trail (P1-F) and the future cumulative model read the same config.
  // Default OFF: the pipeline keeps the Phase 1 single-message escalation
  // behaviour until ESCALATION_USE_CUMULATIVE_SCORE is flipped to "true".
  // See docs/phase2-escalation-design.md §2.
  ESCALATION_USE_CUMULATIVE_SCORE: z.enum(["true", "false"]).default("false"),
  ESCALATION_SCORE_THRESHOLD: z.coerce.number().min(0).default(1.5),
  ESCALATION_SCORE_DECAY: z.coerce.number().min(0).max(1).default(0.6),
  // Escalation improvement 2 (P2-L): show a "continue asking" button on the
  // EscalationCard and apply a re-show cooldown. NEXT_PUBLIC_ because the chat
  // UI reads it client-side. Default OFF — keep the Phase 1 behaviour (card
  // always shown, no continue button) until the wording is lawyer-approved
  // and the interaction is verified. See phase2-escalation-design.md §3.
  NEXT_PUBLIC_ESCALATION_SHOW_CONTINUE_BUTTON: z
    .enum(["true", "false"])
    .default("false"),
});

const paymentEnabledSchema = baseSchema.extend({
  KOMOJU_PUBLIC_KEY: z.string().min(1),
  KOMOJU_SECRET_KEY: z.string().min(1),
  KOMOJU_WEBHOOK_SECRET: z.string().min(1),
});

const optionalKeys = [
  "MESSENGER_PAGE_ACCESS_TOKEN",
  "MESSENGER_VERIFY_TOKEN",
  "MESSENGER_APP_SECRET",
  "KOMOJU_PUBLIC_KEY",
  "KOMOJU_SECRET_KEY",
  "KOMOJU_WEBHOOK_SECRET",
] as const;

export type AppEnv = z.infer<typeof baseSchema> & {
  KOMOJU_PUBLIC_KEY?: string;
  KOMOJU_SECRET_KEY?: string;
  KOMOJU_WEBHOOK_SECRET?: string;
  MESSENGER_PAGE_ACCESS_TOKEN?: string;
  MESSENGER_VERIFY_TOKEN?: string;
  MESSENGER_APP_SECRET?: string;
};

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const raw = process.env;
  const paymentEnabled = raw.NEXT_PUBLIC_PAYMENT_ENABLED === "true";
  const schema = paymentEnabled ? paymentEnabledSchema : baseSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Environment validation failed:\n${missing}\n\nSee apps/v2/.env.example for required variables.`,
    );
  }
  for (const key of optionalKeys) {
    if (!raw[key] && process.env.NODE_ENV !== "test") {
      console.warn(`[env] OPTIONAL ${key} is not set (ok unless feature requires it)`);
    }
  }
  cached = parsed.data as AppEnv;
  return cached;
}

export function isPaymentRequired(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENT_ENABLED === "true";
}
