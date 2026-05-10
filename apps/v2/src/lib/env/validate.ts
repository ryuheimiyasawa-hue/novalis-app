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
  SENTRY_DSN: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().min(1),
  SENTRY_ORG: z.string().min(1),
  SENTRY_PROJECT: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(["ja", "en", "tl"]).default("ja"),
  NEXT_PUBLIC_PAYMENT_ENABLED: z.enum(["true", "false"]).default("false"),
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
