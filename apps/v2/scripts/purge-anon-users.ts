// Anonymous-user purge CLI (Phase 2 / M0 P0-C).
//
//   pnpm purge:anon                 # dry-run: report what WOULD be deleted
//   pnpm purge:anon --apply         # actually delete
//   pnpm purge:anon --hours 168     # override retention window (default 72h)
//   pnpm purge:anon --apply --hours 168
//
// Why: supabase.auth.signInAnonymously() creates a real auth.users row that
// survives until explicitly deleted. The "try without signing in" beta path
// (anon-signin-button.tsx) accumulates these indefinitely. This CLI deletes
// anonymous users older than the retention window. Deleting the auth user
// CASCADES to profiles (profiles.id REFERENCES auth.users(id) ON DELETE
// CASCADE) and onward to conversations / messages / chat_usage / consent_logs
// (all FK ON DELETE CASCADE on profiles), so the user's data is fully removed.
//
// Safety:
//   - Dry-run is the default. Deletion only happens with --apply.
//   - Only rows with is_anonymous = true are ever touched. Permanent users
//     (email / Facebook) are never selected.
//   - Errors during deletion are caught per-user and counted; one failure does
//     not abort the run.
//
// Loads .env.local for SUPABASE_* the same way scripts/reindex.ts does, to
// avoid a runtime dotenv dependency. Everything sits inside main() so tsx can
// transpile to CJS without the top-level-await error.

import fs from "node:fs";
import path from "node:path";

const DEFAULT_RETENTION_HOURS = 72;
const PER_PAGE = 1000;

function loadEnvLocal(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) {
    console.warn("[purge-anon] .env.local not found in cwd; relying on process env");
    return;
  }
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

interface Options {
  apply: boolean;
  retentionHours: number;
}

function parseArgs(argv: string[]): Options {
  const apply = argv.includes("--apply");
  let retentionHours = Number(process.env.ANON_RETENTION_HOURS ?? DEFAULT_RETENTION_HOURS);
  const hoursIdx = argv.indexOf("--hours");
  if (hoursIdx !== -1 && argv[hoursIdx + 1]) {
    retentionHours = Number(argv[hoursIdx + 1]);
  }
  if (!Number.isFinite(retentionHours) || retentionHours <= 0) {
    throw new Error(`invalid retention hours: ${retentionHours}`);
  }
  return { apply, retentionHours };
}

async function main(): Promise<number> {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[purge-anon] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    return 1;
  }

  const opts = parseArgs(process.argv.slice(2));
  const cutoff = new Date(Date.now() - opts.retentionHours * 3600_000);

  // Lazy import so env is loaded before the SDK reads anything.
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Page through every auth user and collect the anonymous ones older than
  // the cutoff. listUsers caps at 1000/page; loop until a short page.
  const stale: { id: string; createdAt: string }[] = [];
  let page = 1;
  let scanned = 0;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error("[purge-anon] listUsers failed:", error.message);
      return 1;
    }
    const users = data.users ?? [];
    scanned += users.length;
    for (const u of users) {
      // is_anonymous lives on the user object; guard defensively in case the
      // SDK shape omits it on a given version.
      const isAnon = (u as { is_anonymous?: boolean }).is_anonymous === true;
      if (isAnon && u.created_at && new Date(u.created_at) < cutoff) {
        stale.push({ id: u.id, createdAt: u.created_at });
      }
    }
    if (users.length < PER_PAGE) break;
    page += 1;
  }

  console.log(
    `[purge-anon] scanned=${scanned} retention=${opts.retentionHours}h ` +
      `cutoff=${cutoff.toISOString()} stale_anon=${stale.length} mode=${opts.apply ? "APPLY" : "dry-run"}`,
  );

  if (stale.length === 0) {
    console.log("[purge-anon] nothing to purge");
    return 0;
  }

  for (const s of stale.slice(0, 10)) {
    console.log(`  - ${s.id}  created_at=${s.createdAt}`);
  }
  if (stale.length > 10) console.log(`  ...and ${stale.length - 10} more`);

  if (!opts.apply) {
    console.log("[purge-anon] dry-run: no users deleted. Re-run with --apply to delete.");
    return 0;
  }

  let deleted = 0;
  let failed = 0;
  for (const s of stale) {
    const { error } = await admin.auth.admin.deleteUser(s.id);
    if (error) {
      failed += 1;
      console.error(`[purge-anon] delete failed id=${s.id}: ${error.message}`);
      continue;
    }
    deleted += 1;
  }

  console.log(`[purge-anon] done. deleted=${deleted} failed=${failed}`);
  return failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[purge-anon] fatal:", err);
    process.exit(1);
  });
