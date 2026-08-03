// P0-B. The migrations this build expects the database to have.
//
// Hand-maintained on purpose: the app is bundled, so it cannot list
// `supabase/migrations/` at runtime. `tests/unit/migration-manifest.test.ts`
// reads that directory and fails if this array drifts from it, which
// means CI blocks any migration file added without an entry here — and
// it does so without giving CI database credentials.
//
// The runtime half lives in `migration-drift.ts`: it compares this list
// against what production actually applied. Together they close the gap
// that produced Lesson 24 and Lesson 27 — a migration that exists in the
// repo, passes review, ships, and was never applied to the database.
//
// When you add a migration: add its file, add its basename here, and
// apply it. Forget the manifest and CI fails; forget to apply it and the
// admin console tells you after the next deploy.
//
// KNOWN LIMIT, read this before trusting a green check: this proves a
// migration *ran*, not that its DDL is *present*. Lesson 24 was a
// partial application — the SQL Editor executed part of 004 and rolled
// the rest back, so two ALTER TABLEs never landed while the function did.
// A history row would have called that migration applied. What protects
// against it now is that migrations go through apply_migration, which is
// transactional: all or nothing. If you ever apply DDL by hand again,
// verify the individual objects in information_schema / pg_catalog
// afterwards (Lesson 24, Lesson 27) — this manifest will not catch it.
export const EXPECTED_MIGRATIONS = [
  "001_v2_schema",
  "002_w2_consent_simple",
  "003_w3_system_categories",
  "004_w5_chat_columns",
  "005_w5_chat_usage_rpc",
  "006_w6_article_video",
  "007_anon_hardening",
  "008_security_hardening",
  "009_messenger_link_codes",
  "010_operator_takeover_rpc",
  "011_applied_migrations_reader",
] as const;

export type ExpectedMigration = (typeof EXPECTED_MIGRATIONS)[number];

export interface MigrationDrift {
  /** In the repo but not applied to this database. The dangerous one. */
  missing: string[];
  /** Applied but absent from the manifest — usually an older deploy
   *  reading a newer database, which is expected during a rollout. */
  unexpected: string[];
}

/**
 * Pure set comparison, split out so the interesting cases are testable
 * without a database.
 *
 * Note the asymmetry in how callers should treat the two lists:
 * `missing` means the running code expects schema that isn't there, so
 * queries will fail — that is an alert. `unexpected` is the normal
 * transient during a deploy (database migrated first, old instances
 * still serving) and is informational.
 */
export function diffMigrations(
  expected: readonly string[],
  applied: readonly string[],
): MigrationDrift {
  const appliedSet = new Set(applied);
  const expectedSet = new Set(expected);
  return {
    missing: expected.filter((m) => !appliedSet.has(m)),
    unexpected: applied.filter((m) => !expectedSet.has(m)),
  };
}
