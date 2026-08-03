import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_MIGRATIONS,
  diffMigrations,
} from "@/lib/supabase/migration-manifest";

// P0-B, CI half. This is the test that makes the manifest trustworthy:
// it reads the migrations directory off disk (something the bundled app
// cannot do) and fails when the two disagree. That keeps the drift check
// honest without handing CI any database credentials.

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function migrationFilesOnDisk(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();
}

describe("migration manifest", () => {
  it("lists exactly the migration files in supabase/migrations", () => {
    // Failing here means someone added or renamed a migration without
    // updating EXPECTED_MIGRATIONS. Add the basename to the manifest —
    // and make sure the migration is actually applied to production,
    // which is the failure this whole mechanism exists to catch.
    expect([...EXPECTED_MIGRATIONS]).toEqual(migrationFilesOnDisk());
  });

  it("keeps the manifest in applied order", () => {
    expect([...EXPECTED_MIGRATIONS]).toEqual([...EXPECTED_MIGRATIONS].sort());
  });

  it("has no duplicates", () => {
    expect(new Set(EXPECTED_MIGRATIONS).size).toBe(EXPECTED_MIGRATIONS.length);
  });
});

describe("diffMigrations", () => {
  it("reports nothing when the database matches the build", () => {
    expect(diffMigrations(["001_a", "002_b"], ["001_a", "002_b"])).toEqual({
      missing: [],
      unexpected: [],
    });
  });

  it("flags a migration that shipped but was never applied", () => {
    // Lesson 24 in miniature: the code expects 002_b's schema, the
    // database has never seen it, and every query touching it fails.
    expect(diffMigrations(["001_a", "002_b"], ["001_a"])).toEqual({
      missing: ["002_b"],
      unexpected: [],
    });
  });

  it("treats a newer database as unexpected, not missing", () => {
    // Normal mid-rollout state: migration applied, old instances still
    // serving. Must not read as an alert.
    expect(diffMigrations(["001_a"], ["001_a", "002_b"])).toEqual({
      missing: [],
      unexpected: ["002_b"],
    });
  });

  it("separates the two directions when both are true", () => {
    expect(diffMigrations(["001_a", "002_b"], ["001_a", "003_c"])).toEqual({
      missing: ["002_b"],
      unexpected: ["003_c"],
    });
  });

  it("treats an empty history as everything missing", () => {
    // What a brand-new or wrong database looks like. Should scream.
    expect(diffMigrations(["001_a", "002_b"], []).missing).toEqual([
      "001_a",
      "002_b",
    ]);
  });

  it("ignores ordering differences", () => {
    expect(diffMigrations(["001_a", "002_b"], ["002_b", "001_a"])).toEqual({
      missing: [],
      unexpected: [],
    });
  });
});
