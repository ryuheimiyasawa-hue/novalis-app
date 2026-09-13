import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}));

import { POST } from "@/app/api/onboarding/route";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal/versions";

function makeRequest(body: unknown): Request {
  return new Request("https://app.novalis.ph/api/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Records the order of writes: profile fields must land before
// record_consent stamps onboarded_at.
function makeAdminMock(
  opts: {
    updateError?: { message: string } | null;
    rpcError?: { message: string } | null;
  } = {},
) {
  const calls: string[] = [];
  const updateEq = vi.fn(async () => {
    calls.push("profiles.update");
    return { error: opts.updateError ?? null };
  });
  const update = vi.fn(() => ({ eq: updateEq }));
  const rpc = vi.fn(async (name: string) => {
    calls.push(`rpc:${name}`);
    return { data: "log-1", error: opts.rpcError ?? null };
  });
  const from = vi.fn((table: string) => {
    if (table === "profiles") return { update };
    throw new Error(`unexpected table: ${table}`);
  });
  return { from, rpc, update, calls };
}

const validBody = {
  terms_version: CURRENT_TERMS_VERSION,
  privacy_version: CURRENT_PRIVACY_VERSION,
  age_verified: true,
  preferred_language: "ja" as const,
  prefecture_code: "JP-13",
  city_name: "Shibuya",
};

describe("POST /api/onboarding", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(new AuthError("UNAUTHORIZED"));
    const res = await POST(makeRequest(validBody) as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 when prefecture_code does not match JP-NN format", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    const res = await POST(makeRequest({ ...validBody, prefecture_code: "13" }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when age_verified is false", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    const res = await POST(makeRequest({ ...validBody, age_verified: false }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when preferred_language is invalid", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    const res = await POST(makeRequest({ ...validBody, preferred_language: "zh" }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 409 and writes nothing when the version is not the one in force", async () => {
    const admin = makeAdminMock();
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValue(admin as never);
    const res = await POST(makeRequest({ ...validBody, privacy_version: "0.9.0" }) as never);
    expect(res.status).toBe(409);
    expect(admin.calls).toEqual([]);
  });

  it("saves the profile, then records consent and marks onboarded in one RPC", async () => {
    const admin = makeAdminMock();
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(admin as never);
    const res = await POST(makeRequest({ ...validBody, privacy_opened: true }) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(admin.calls).toEqual(["profiles.update", "rpc:record_consent"]);
    // onboarded_at / age_verified are the RPC's job, never the plain update.
    expect(admin.update).toHaveBeenCalledWith({
      preferred_language: "ja",
      prefecture_code: "JP-13",
      city_name: "Shibuya",
    });
    expect(admin.rpc).toHaveBeenCalledWith("record_consent", {
      p_user_id: "u1",
      p_terms_version: CURRENT_TERMS_VERSION,
      p_privacy_version: CURRENT_PRIVACY_VERSION,
      p_terms_opened: false,
      p_privacy_opened: true,
      p_mark_onboarded: true,
    });
  });

  it("accepts an empty optional city_name", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(makeAdminMock() as never);
    const res = await POST(makeRequest({ ...validBody, city_name: "" }) as never);
    expect(res.status).toBe(200);
  });

  it("does not record consent when the profile update fails", async () => {
    const admin = makeAdminMock({ updateError: { message: "db down" } });
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(admin as never);
    const res = await POST(makeRequest(validBody) as never);
    expect(res.status).toBe(500);
    expect(admin.rpc).not.toHaveBeenCalled();
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
