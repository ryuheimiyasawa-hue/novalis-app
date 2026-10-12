// Exercise the real E2E setup with synthetic Supabase and filesystem adapters.
// No account, session, consent record or file is created by these tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gateDecision } from "@/lib/legal/consent";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/versions";

const h = vi.hoisted(() => ({
  createUser: vi.fn(), listUsers: vi.fn(), upsert: vi.fn(), rpc: vi.fn(),
  signIn: vi.fn(), createClient: vi.fn(), exists: vi.fn(), read: vi.fn(),
  mkdir: vi.fn(), write: vi.fn(), latest: null as null | { terms_version: string; privacy_version: string },
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: h.createClient }));
vi.mock("node:fs", () => ({ default: {
  existsSync: h.exists, readFileSync: h.read, mkdirSync: h.mkdir, writeFileSync: h.write,
} }));
import globalSetup from "../e2e/global-setup";

const USER_ID = "00000000-0000-4000-8000-000000000101";
const TEST_URL = "http://127.0.0.1:54321";
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllEnvs(); h.latest = null;
  vi.stubEnv("E2E_ALLOW_DB_WRITES", "1");
  vi.stubEnv("E2E_TEST_SUPABASE_URL", TEST_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", TEST_URL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon");
  h.exists.mockReturnValue(false);
  h.createUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  h.listUsers.mockResolvedValue({ data: { users: [{ id: USER_ID, email: "e2e-test@novalis-test.local" }] }, error: null });
  h.upsert.mockResolvedValue({ error: null });
  h.rpc.mockImplementation(async (_name, args) => {
    h.latest = { terms_version: args.p_terms_version, privacy_version: args.p_privacy_version };
    return { data: "synthetic-consent-id", error: null };
  });
  h.signIn.mockResolvedValue({ data: { user: { id: USER_ID }, session: {
    access_token: "synthetic-access", refresh_token: "synthetic-refresh",
    expires_at: 2_000_000_000, expires_in: 3600, token_type: "bearer",
  } }, error: null });
  h.createClient.mockImplementation((_url, key) => {
    if (key === "synthetic-service") return {
      auth: { admin: { createUser: h.createUser, listUsers: h.listUsers } },
      from: (table: string) => {
        if (table !== "profiles") throw new Error("Unexpected table");
        return { upsert: h.upsert };
      }, rpc: h.rpc,
    };
    if (key === "synthetic-anon") return { auth: { signInWithPassword: h.signIn } };
    throw new Error("Unexpected synthetic key");
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("E2E account preparation: current consent is mandatory", () => {
  it("records current consent before signing in a newly created user", async () => {
    expect(gateDecision({ onboarded: true, terms_version: null, privacy_version: null })).toBe("consent");
    await globalSetup();
    expect(h.rpc).toHaveBeenCalledWith("record_consent", {
      p_user_id: USER_ID, p_terms_version: CURRENT_TERMS_VERSION,
      p_privacy_version: CURRENT_PRIVACY_VERSION, p_terms_opened: true,
      p_privacy_opened: true, p_mark_onboarded: true,
    });
    expect(gateDecision({ onboarded: true, ...h.latest! })).toBe("pass");
    expect(h.rpc.mock.invocationCallOrder[0]).toBeLessThan(h.signIn.mock.invocationCallOrder[0]!);
    expect(h.write).toHaveBeenCalledOnce();
  });
  it("refreshes the profile and stale/missing consent of an existing user", async () => {
    h.createUser.mockResolvedValue({ data: { user: null }, error: { code: "email_exists", message: "already registered" } });
    h.latest = { terms_version: "1.0.0", privacy_version: "1.0.0" };
    await globalSetup();
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: USER_ID, age_verified: true }), { onConflict: "id" });
    expect(h.rpc).toHaveBeenCalledOnce();
    expect(gateDecision({ onboarded: true, ...h.latest! })).toBe("pass");
  });
  it("stops before sign-in/state output when profile preparation fails", async () => {
    h.upsert.mockResolvedValue({ error: { message: "synthetic profile failure" } });
    await expect(globalSetup()).rejects.toThrow(/profile/i);
    expect(h.rpc).not.toHaveBeenCalled(); expect(h.signIn).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });
  it("stops before sign-in/state output when current consent cannot be recorded", async () => {
    h.rpc.mockResolvedValue({ error: { message: "synthetic consent failure" } });
    await expect(globalSetup()).rejects.toThrow(/consent/i);
    expect(h.signIn).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
  });
  it("requires an explicit write opt-in before reading local env or creating clients", async () => {
    vi.stubEnv("E2E_ALLOW_DB_WRITES", "0");
    await expect(globalSetup()).rejects.toThrow(/E2E_ALLOW_DB_WRITES/);
    expect(h.exists).not.toHaveBeenCalled(); expect(h.createClient).not.toHaveBeenCalled();
  });
  it("rejects a configured Supabase URL that differs from the pinned test target", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://unapproved-project.invalid");
    await expect(globalSetup()).rejects.toThrow(/E2E_TEST_SUPABASE_URL/);
    expect(h.createClient).not.toHaveBeenCalled();
  });
  it.each(["not-a-url", "file:///tmp/test", "https://user:password@test.invalid", "https://test.invalid/path", "https://test.invalid?x=1", "https://test.invalid#fragment"])("rejects an invalid or decorated pinned target: %s", async (url) => {
    vi.stubEnv("E2E_TEST_SUPABASE_URL", url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    await expect(globalSetup()).rejects.toThrow(/E2E/);
    expect(h.exists).not.toHaveBeenCalled(); expect(h.createClient).not.toHaveBeenCalled();
  });
  it("does not write authentication state when sign-in fails", async () => {
    h.signIn.mockResolvedValue({ data: { session: null }, error: { message: "synthetic sign-in failure" } });
    await expect(globalSetup()).rejects.toThrow(/sign-in/);
    expect(h.mkdir).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
  });
});
