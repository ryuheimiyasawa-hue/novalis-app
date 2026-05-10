# Test workflow (W3 baseline)

## Layers

| Layer | Where | How to run | What it covers |
|---|---|---|---|
| Unit | `tests/unit/*.test.ts` | `pnpm test` | Pure functions, Zod schemas, response envelope, admin guards |
| Integration | _(not yet wired)_ | — | Phase 2: hit Next.js routes against a real test DB |
| RLS | `supabase/tests/rls.test.sql` | Paste into Supabase Dashboard SQL Editor | Anon and cross-tenant isolation against the deployed DB |
| E2E | _(not yet wired)_ | — | Phase 2: Playwright walkthrough of admin CRUD + login → chat (W5) |

`pnpm test` runs the unit layer (vitest) and is the only layer enforced
by typecheck / lint / build. The other layers are run on demand.

## Running RLS tests

1. Open Supabase Dashboard → SQL Editor.
2. Paste the entire contents of `supabase/tests/rls.test.sql`.
3. Run.
4. Expected output: two `NOTICE` lines —
   - `RLS test 1 (anon) PASSED`
   - `RLS test 2 (authenticated cross-user isolation) PASSED`
5. Any failure raises a clear `EXCEPTION` naming the table and the leak.
   The script wraps everything in `BEGIN ... ROLLBACK` so test rows are
   discarded even on failure.

Run this script after any change to:
- `supabase/migrations/` (new policies, dropped policies, new tables)
- The shape of any `*_public_read` policy
- `auth.users` triggers that affect profile creation

## Why no integration / E2E layer yet

The MVP scope (W3 admin + W4 Whitelist + W5 Web chat) does not depend
on automated browser tests for correctness — admin CRUD is exercised
manually after each change, and Web chat will be exercised via the
chat itself in W5.

A Playwright E2E run becomes worth its setup cost when:
1. There is a critical user-facing path that regressions could silently
   break (the chat send → answer flow once W5 lands).
2. We are about to enable paid plans (W6 Komoju), where a regression in
   the checkout flow has direct revenue impact.

Until then: prioritise unit + RLS coverage and keep the manual checklist
in `tasks/W3-design.md` §11 up to date.
