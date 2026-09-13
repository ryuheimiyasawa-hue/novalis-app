import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Wiring tests for the page-load half of the consent gate in src/proxy.ts.
// The decision itself is pinned in consent-gate.test.ts; this file pins
// which paths are gated, where they are sent, and that the exempt pages
// cannot loop. Supabase and next-intl are mocked; nothing leaves the process.

const getUser = vi.fn();
const rpc = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser }, rpc })),
}));
vi.mock("next-intl/middleware", () => ({
  default: vi.fn(() => () => NextResponse.next()),
}));

import { proxy } from "@/proxy";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal/versions";

const current = { terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION };

function req(path: string, init?: { method?: string }) {
  return new NextRequest(new URL(path, "https://app.example.com"), init);
}

function redirectPath(res: Response): string | null {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname : null;
}

function signedIn() {
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
}

function gateState(state: unknown, error: unknown = null) {
  rpc.mockResolvedValue({ data: state === undefined ? [] : [state], error });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("proxy consent gate: page loads", () => {
  it("sends signed-out visitors of a gated page to login", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });
    const res = await proxy(req("/ja/chat"));
    expect(redirectPath(res)).toBe("/ja/login");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends a user with no profile to onboarding", async () => {
    signedIn();
    gateState(undefined);
    const res = await proxy(req("/en/dashboard"));
    expect(redirectPath(res)).toBe("/en/onboarding");
  });

  it("sends a not-onboarded user to onboarding", async () => {
    signedIn();
    gateState({ onboarded: false, ...current });
    expect(redirectPath(await proxy(req("/ja/chat")))).toBe("/ja/onboarding");
  });

  it("sends an onboarded user with stale consent to /consent in their locale", async () => {
    signedIn();
    gateState({ onboarded: true, ...current, terms_version: "0.0.1" });
    expect(redirectPath(await proxy(req("/tl/chat")))).toBe("/tl/consent");
  });

  it("sends an onboarded user with no consent log at all to /consent", async () => {
    signedIn();
    gateState({ onboarded: true, terms_version: null, privacy_version: null });
    expect(redirectPath(await proxy(req("/ja/messenger")))).toBe("/ja/consent");
  });

  it("lets a user with current consent through", async () => {
    signedIn();
    gateState({ onboarded: true, ...current });
    const res = await proxy(req("/ja/chat"));
    expect(redirectPath(res)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("consent_gate_state");
  });

  it("gates admin pages too", async () => {
    signedIn();
    gateState({ onboarded: true, terms_version: null, privacy_version: null });
    expect(redirectPath(await proxy(req("/admin/articles")))).toBe("/ja/consent");
  });

  it("fails open on a DB error (the API gates fail closed instead)", async () => {
    signedIn();
    gateState(undefined, { message: "timeout" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(redirectPath(await proxy(req("/ja/chat")))).toBeNull();
    warn.mockRestore();
  });
});

describe("proxy consent gate: exemptions", () => {
  it.each(["/ja/consent", "/en/onboarding"])("never redirects %s to itself", async (path) => {
    signedIn();
    gateState({ onboarded: false, terms_version: null, privacy_version: null });
    const res = await proxy(req(path));
    expect(redirectPath(res)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["/ja/legal/terms", "/en/legal/privacy", "/ja/login"])(
    "keeps %s public so the documents can be read before agreeing",
    async (path) => {
      const res = await proxy(req(path));
      expect(redirectPath(res)).toBeNull();
      expect(getUser).not.toHaveBeenCalled();
    },
  );

  it("does not run the page gate on API routes (they check consent themselves)", async () => {
    signedIn();
    const res = await proxy(req("/api/chat/send", { method: "POST" }));
    expect(res.status).not.toBe(307);
    expect(rpc).not.toHaveBeenCalled();
  });
});
