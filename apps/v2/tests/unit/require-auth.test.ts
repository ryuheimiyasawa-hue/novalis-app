import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";

describe("requireAuth", () => {
  beforeEach(() => getUser.mockReset());

  it("returns a Facebook or email user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", is_anonymous: false } }, error: null });
    await expect(requireAuth()).resolves.toMatchObject({ id: "u1" });
  });

  it("rejects a guest (anonymous) session as signed out", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u2", is_anonymous: true } }, error: null });
    await expect(requireAuth()).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireAuth()).rejects.toBeInstanceOf(AuthError);
  });
});
