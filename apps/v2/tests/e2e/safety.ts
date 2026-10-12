// E2E provisions users and writes chat data. Require a deliberately selected
// test project before any env-file read, client creation or server startup.
// The pin detects a configuration mismatch; the operator must still verify
// that this project is isolated from production data.
export function assertE2ETestTarget(): void {
  if (process.env.E2E_ALLOW_DB_WRITES !== "1") {
    throw new Error("E2E setup: set E2E_ALLOW_DB_WRITES=1 only for an isolated test database.");
  }
  const pinned = process.env.E2E_TEST_SUPABASE_URL;
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!pinned || !configured) {
    throw new Error("E2E setup: E2E_TEST_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL must explicitly select the same test project.");
  }
  let target: URL;
  let actual: URL;
  try {
    target = new URL(pinned);
    actual = new URL(configured);
  } catch {
    throw new Error("E2E setup: invalid E2E_TEST_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username || target.password || target.search || target.hash ||
    target.pathname !== "/" || actual.href !== target.href
  ) {
    throw new Error("E2E setup: NEXT_PUBLIC_SUPABASE_URL must match the pinned E2E_TEST_SUPABASE_URL exactly.");
  }
}
