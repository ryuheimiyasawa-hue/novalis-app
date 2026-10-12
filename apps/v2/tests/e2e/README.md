# Browser E2E

This suite creates/reuses a test account, refreshes its profile and current
terms/privacy consent, writes authentication state, and saves chat messages.
Run it only against a separate test Supabase project with synthetic data.
The test project must already contain the app's schema, including
`record_consent`. Do not point it at a production or shared user database.

Explicitly set both `E2E_TEST_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` to
the same test project URL, and set `E2E_ALLOW_DB_WRITES=1` in the environment
that launches Playwright. The guard runs before loading `.env.local` or
starting Next; these three values cannot be enabled implicitly by that file.
The exact URL pin catches configuration mistakes; it does not establish that
the selected database is safe. Confirm the database's separation first.

Supply the matching test-only `SUPABASE_SERVICE_ROLE_KEY` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus the app's other test dependencies.
Use dedicated `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` values. Current fallback
credentials are synthetic defaults and must not be used outside test projects.
The happy-path chat request also uses the configured AI service; do not run it
where external requests or charges have not been authorized.

With the required services and an already installed Playwright browser:

```sh
pnpm --filter v2 e2e
```

Playwright uses one worker and starts its own server on localhost:3000. Stop
before running if that port belongs to another developer's process; the suite
does not reuse it. A citation is mandatory in the happy-path answer.

For an offline check of setup, assertions, reset/cancellation and server-page
contracts, without a browser or real Supabase/AI calls:

```sh
pnpm --filter v2 exec vitest run tests/unit/e2e-global-setup.test.ts tests/unit/e2e-chat-citation.test.ts tests/unit/chat-shell-stream.test.ts tests/unit/chat-navigation-reset.test.ts tests/unit/chat-page-navigation.test.ts --maxWorkers=1
```

These tests use synthetic adapters. They do not prove real browser navigation,
responsive layout, cookies accepted by a live Supabase server, or AI quality.
Keep `tests/e2e/.auth/state.json` private and out of version control.
