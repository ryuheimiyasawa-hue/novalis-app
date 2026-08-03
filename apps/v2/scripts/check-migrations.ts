// Migration drift CLI (Phase 2 / M0 P0-B).
//
//   pnpm check:migrations
//
// Compares the migrations this repo ships against what the target
// database has actually applied, and exits non-zero when the database is
// behind. Run it before merging anything that adds a migration, and when
// the admin console shows the drift banner.
//
// Why this exists: twice a migration lived in the repo without ever
// reaching production, and nothing said so. Lesson 24 (messages.citations
// missing → assistant messages silently failed to persist for 8 days) and
// Lesson 27 (007_anon_hardening never applied → anonymous users could
// tamper with profiles). "The file is in git" is not evidence.
//
// The app performs the same check at runtime and surfaces it in /admin;
// this CLI is the pre-merge version of that signal.
//
// Reads .env.local for SUPABASE_* the same way scripts/purge-anon-users.ts
// does, and keeps everything inside main() so tsx can transpile to CJS.

import fs from "node:fs";
import path from "node:path";

function loadEnvLocal(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) {
    console.warn("[check-migrations] .env.local not found in cwd; relying on process env");
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

function migrationFilesOnDisk(): string[] {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();
}

async function main(): Promise<void> {
  loadEnvLocal();

  const { createClient } = await import("@supabase/supabase-js");
  const { EXPECTED_MIGRATIONS, diffMigrations } = await import(
    "../src/lib/supabase/migration-manifest"
  );

  // Manifest-vs-disk first: it needs no credentials, so it still runs on
  // a machine without production env (which is the normal state for this
  // repo). It is also the prerequisite — comparing a stale manifest
  // against the database would only produce noise.
  const onDisk = migrationFilesOnDisk();
  const manifest = [...EXPECTED_MIGRATIONS];
  if (JSON.stringify(manifest) !== JSON.stringify(onDisk)) {
    console.error("[check-migrations] manifest is out of sync with supabase/migrations/");
    console.error(`  manifest: ${manifest.join(", ")}`);
    console.error(`  on disk : ${onDisk.join(", ")}`);
    console.error("  fix src/lib/supabase/migration-manifest.ts first");
    process.exit(1);
  }
  console.log(`[check-migrations] manifest matches ${onDisk.length} files on disk`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Distinguish "not set" from "set but blank" — this repo's .env.local
    // carries the keys with empty values, and "required" alone sends you
    // hunting for a variable that is already there.
    const describe = (name: string) =>
      process.env[name] === undefined
        ? `${name} is not set`
        : `${name} is set but empty`;
    console.error("[check-migrations] cannot reach the database:");
    console.error(`  ${describe("NEXT_PUBLIC_SUPABASE_URL")}`);
    console.error(`  ${describe("SUPABASE_SERVICE_ROLE_KEY")}`);
    console.error("  the manifest check above still passed; only the DB comparison was skipped");
    process.exit(2);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("applied_migrations");
  if (error) {
    console.error(`[check-migrations] could not read migration history: ${error.message}`);
    console.error("  if applied_migrations() is missing, apply 011_applied_migrations_reader");
    process.exit(1);
  }

  const applied = ((data ?? []) as Array<{ name: string }>).map((r) => r.name);
  const drift = diffMigrations(manifest, applied);

  if (drift.missing.length === 0 && drift.unexpected.length === 0) {
    console.log(`[check-migrations] OK — ${applied.length} migrations applied, none missing`);
    return;
  }

  if (drift.unexpected.length > 0) {
    console.warn(
      `[check-migrations] applied but not in this build: ${drift.unexpected.join(", ")}`,
    );
    console.warn("  expected mid-deploy; investigate if it persists");
  }

  if (drift.missing.length > 0) {
    console.error(`[check-migrations] NOT APPLIED: ${drift.missing.join(", ")}`);
    console.error("  apply these before merging, or the shipped code will hit missing schema");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[check-migrations] failed:", e instanceof Error ? e.message : e);
  process.exit(2);
});
