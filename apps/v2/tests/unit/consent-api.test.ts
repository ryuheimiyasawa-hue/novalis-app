import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

// Mock the auth + admin client modules so the route handler can be unit-tested
// without a real Supabase connection.
vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}));

import { POST } from "@/app/api/consent/route";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal/versions";

function makeRequest(body: unknown): Request {
  return new Request("https://app.novalis.ph/api/consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// record_consent (migration 012) is the only write path; the route must not
// touch tables directly, so `from` throws if it is ever called.
function makeAdminMock(opts: { rpcError?: { message: string } | null } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: "log-1", error: opts.rpcError ?? null });
  const from = vi.fn(() => {
    throw new Error("route must write through record_consent, not from()");
  });
  return { rpc, from };
}

const validBody = {
  terms_version: CURRENT_TERMS_VERSION,
  privacy_version: CURRENT_PRIVACY_VERSION,
  age_verified: true,
};

describe("POST /api/consent", () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) so queued mockReturnValueOnce / mockResolvedValueOnce
    // values from earlier tests are dropped, not just call history.
    vi.resetAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(new AuthError("UNAUTHORIZED"));
    const res = await POST(makeRequest(validBody) as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 when age_verified is false", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(makeAdminMock() as never);
    const res = await POST(makeRequest({ ...validBody, age_verified: false }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when terms_version is empty", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    const res = await POST(makeRequest({ ...validBody, terms_version: "" }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 409 and records nothing when the submitted version is not the one in force", async () => {
    const admin = makeAdminMock();
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValue(admin as never);
    const res = await POST(makeRequest({ ...validBody, terms_version: "0.9.0" }) as never);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("VERSION_MISMATCH");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("records consent for the session user without marking them onboarded", async () => {
    const admin = makeAdminMock();
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(admin as never);
    const res = await POST(
      makeRequest({ ...validBody, terms_opened: true, user_id: "someone-else" }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(admin.rpc).toHaveBeenCalledWith("record_consent", {
      p_user_id: "u1",
      p_terms_version: CURRENT_TERMS_VERSION,
      p_privacy_version: CURRENT_PRIVACY_VERSION,
      p_terms_opened: true,
      p_privacy_opened: false,
      p_mark_onboarded: false,
    });
  });

  it("accepts an anonymous session (lawyer review 2-5)", async () => {
    const admin = makeAdminMock();
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "anon-1", is_anonymous: true } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(admin as never);
    const res = await POST(makeRequest(validBody) as never);
    expect(res.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledOnce();
  });

  it("returns 500 when record_consent fails", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(
      makeAdminMock({ rpcError: { message: "db down" } }) as never,
    );
    const res = await POST(makeRequest(validBody) as never);
    expect(res.status).toBe(500);
  });
});
