// Playwright global setup. Creates / refreshes a single test user
// via the Supabase admin API, signs in via password to get a real
// session, and writes the resulting cookies to storageState so the
// happy-path test can hit /[locale]/chat without going through the
// Facebook OAuth dance.
//
// The test user is keyed by env so a developer running locally can
// override per-machine without polluting shared accounts.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "e2e-test@novalis-test.local";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "e2e-password-DO-NOT-USE-IN-PROD";

function loadEnvLocal(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function ensureTestUser(): Promise<{ userId: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Try to create; if it already exists we just look it up.
  const created = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (created.data.user) {
    const userId = created.data.user.id;
    // Ensure a profile row exists so middleware doesn't redirect to
    // onboarding. trial_ends_at must be set (NOT NULL in schema).
    const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await admin.from("profiles").upsert(
      {
        id: userId,
        facebook_id: `e2e-${userId}`,
        display_name: "E2E Tester",
        preferred_language: "ja",
        prefecture_code: "JP-13",
        city_name: "渋谷区",
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEnd.toISOString(),
        onboarded_at: new Date().toISOString(),
        age_verified: true,
      },
      { onConflict: "id" },
    );
    return { userId };
  }
  // createUser failed (probably "already registered"); look up.
  // listUsers paginates; fetch the first page (enough for tests).
  const list = await admin.auth.admin.listUsers();
  const existing = list.data.users.find((u) => u.email === TEST_EMAIL);
  if (!existing) {
    throw new Error(
      `E2E setup: failed to create or find test user (${created.error?.message ?? "no user returned"})`,
    );
  }
  return { userId: existing.id };
}

export default async function globalSetup(): Promise<void> {
  loadEnvLocal();
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "E2E setup: missing Supabase env vars. Check apps/v2/.env.local.",
    );
  }

  await ensureTestUser();

  // Sign in with the anon key to get a real session pair.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signIn = await anon.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signIn.error || !signIn.data.session) {
    throw new Error(`E2E setup: sign-in failed: ${signIn.error?.message}`);
  }
  const session = signIn.data.session;

  // Build the cookie value that @supabase/ssr 0.10 expects.
  //   - Cookie name base: sb-<project-ref>-auth-token
  //   - Value: "base64-" + base64url(JSON.stringify(session))
  //   - When the resulting value exceeds MAX_CHUNK_SIZE (3180 chars),
  //     SSR splits it into name.0, name.1, ... cookies. We mirror
  //     that split here so the SSR client can recombine on read.
  // The earlier JSON-array shape (used by the legacy auth-helpers
  // package) is not understood by ssr 0.10 — the middleware then
  // fails to authenticate and redirects to /login, which is what
  // broke the first e2e run.
  // Refs: node_modules/@supabase/ssr/dist/main/cookies.js (decode)
  //       node_modules/@supabase/ssr/dist/main/utils/chunker.js (split)
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const cookieBaseName = `sb-${projectRef}-auth-token`;
  const sessionPayload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type ?? "bearer",
    user: signIn.data.user,
  };
  const b64 = Buffer.from(JSON.stringify(sessionPayload)).toString("base64url");
  const cookieValue = `base64-${b64}`;

  // base64url chars (A-Z a-z 0-9 - _) plus the literal "base64-"
  // dash are all URI-safe, so the wire size equals the literal
  // string length and we can split on any character boundary.
  const MAX_CHUNK_SIZE = 3180;
  const cookies =
    cookieValue.length <= MAX_CHUNK_SIZE
      ? [{ name: cookieBaseName, value: cookieValue }]
      : [];
  if (cookies.length === 0) {
    for (let i = 0, idx = 0; i < cookieValue.length; i += MAX_CHUNK_SIZE, idx++) {
      cookies.push({
        name: `${cookieBaseName}.${idx}`,
        value: cookieValue.slice(i, i + MAX_CHUNK_SIZE),
      });
    }
  }

  const storageDir = path.join(process.cwd(), "tests", "e2e", ".auth");
  fs.mkdirSync(storageDir, { recursive: true });
  const storagePath = path.join(storageDir, "state.json");

  fs.writeFileSync(
    storagePath,
    JSON.stringify({
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax" as const,
      })),
      origins: [],
    }),
  );

  console.log(`[e2e-setup] storage state written to ${storagePath}`);
}
