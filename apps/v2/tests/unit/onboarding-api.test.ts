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

type AnyFn = ReturnType<typeof vi.fn>;
interface FakeAdmin {
  from: AnyFn;
}

function makeRequest(body: unknown): Request {
  return new Request("https://app.novalis.ph/api/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeAdminMock(
  opts: {
    insertError?: { message: string } | null;
    fetchData?: { onboarded_at: string | null } | null;
    updateError?: { message: string } | null;
  } = {},
): FakeAdmin {
  const insert = vi.fn().mockResolvedValue({ error: opts.insertError ?? null });
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: opts.fetchData ?? { onboarded_at: null },
        error: null,
      }),
    }),
  });
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
  });
  return {
    from: vi.fn((table: string) => {
      if (table === "consent_logs") return { insert };
      if (table === "profiles") return { select, update };
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

const validBody = {
  terms_version: "1.0.0",
  privacy_version: "1.0.0",
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
    vi.mocked(getAdminClient).mockReturnValueOnce(makeAdminMock() as never);
    const res = await POST(
      makeRequest({ ...validBody, prefecture_code: "Tokyo" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when age_verified is false", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(makeAdminMock() as never);
    const res = await POST(
      makeRequest({ ...validBody, age_verified: false }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when preferred_language is invalid", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(makeAdminMock() as never);
    const res = await POST(
      makeRequest({ ...validBody, preferred_language: "fr" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 success on a valid submission", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(makeAdminMock() as never);
    const res = await POST(makeRequest(validBody) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true });
  });

  it("accepts an empty optional city_name", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(makeAdminMock() as never);
    const res = await POST(
      makeRequest({ ...validBody, city_name: "" }) as never,
    );
    expect(res.status).toBe(200);
  });

  it("returns 500 when consent_logs insert fails", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(getAdminClient).mockReturnValueOnce(
      makeAdminMock({ insertError: { message: "db down" } }) as never,
    );
    const res = await POST(makeRequest(validBody) as never);
    expect(res.status).toBe(500);
  });
});
