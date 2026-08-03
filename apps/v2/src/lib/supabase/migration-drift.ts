import * as Sentry from "@sentry/nextjs";
import { getAdminClient } from "./admin";
import {
  EXPECTED_MIGRATIONS,
  diffMigrations,
  type MigrationDrift,
} from "./migration-manifest";

// P0-B runtime half. Compares the manifest this build was compiled with
// against what the database actually applied.
//
// `unknown` is a deliberate third state rather than a silent `ok`: if we
// cannot read the history table we do not know whether the schema is
// sound, and reporting that as healthy is precisely the failure mode
// this whole check exists to eliminate.

export type DriftStatus =
  | { state: "ok" }
  | { state: "drift"; drift: MigrationDrift }
  | { state: "unknown"; reason: string };

// One instance serves many admin page loads; re-querying per render buys
// nothing since the answer only changes on deploy or migration.
const TTL_MS = 60_000;
let cached: { at: number; status: DriftStatus } | null = null;

// Sentry is for "someone must look at this", not a heartbeat. Report a
// given drift once per instance, and again only if the set changes.
let lastReported: string | null = null;

function report(drift: MigrationDrift) {
  const fingerprint = drift.missing.join(",");
  if (!fingerprint || fingerprint === lastReported) return;
  lastReported = fingerprint;

  console.error(
    JSON.stringify({
      event: "migration_drift_detected",
      missing: drift.missing,
      unexpected: drift.unexpected,
    }),
  );
  Sentry.captureMessage(
    `migration drift: ${drift.missing.length} migration(s) in the build are not applied to the database`,
    {
      level: "error",
      tags: { area: "schema", op: "migration_drift" },
      extra: { missing: drift.missing, unexpected: drift.unexpected },
    },
  );
}

/** Bypass the cache. Only for tests and the CLI script. */
export function resetMigrationDriftCache() {
  cached = null;
  lastReported = null;
}

export async function checkMigrationDrift(): Promise<DriftStatus> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.status;

  let status: DriftStatus;
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.rpc("applied_migrations");

    if (error) {
      // Most likely cause: migration 011 itself hasn't been applied, so
      // the reader function doesn't exist yet. That is itself drift, but
      // we cannot prove which migrations are missing, so say so plainly.
      status = { state: "unknown", reason: error.message };
    } else {
      const applied = (data ?? []).map((r) => r.name);
      const drift = diffMigrations(EXPECTED_MIGRATIONS, applied);
      if (drift.missing.length === 0) {
        status = { state: "ok" };
      } else {
        report(drift);
        status = { state: "drift", drift };
      }
    }
  } catch (e) {
    status = {
      state: "unknown",
      reason: e instanceof Error ? e.message : String(e),
    };
  }

  cached = { at: now, status };
  return status;
}
