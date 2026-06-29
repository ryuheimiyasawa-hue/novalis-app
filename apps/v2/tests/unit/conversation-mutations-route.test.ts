import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}));

import { PATCH, DELETE } from "@/app/api/chat/conversations/[id]/route";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetAdmin = vi.mocked(getAdminClient);

const OWNER = "user-1";
// Valid v4 UUID (version nibble 4, variant nibble 8) so zod's
// z.string().uuid() accepts it.
const CONV = "11111111-1111-4111-8111-111111111111";

// Admin client stub: the ownership lookup is
//   from("conversations").select(...).eq("id", id).maybeSingle()
// and the mutation is either .update(...).eq("id", id) (PATCH) or
// .delete().eq("id", id) (DELETE). We capture the update payload and
// expose a configurable owner for the lookup.
function makeAdmin(opts: {
  ownerUserId?: string | null; // null => row not found
  updateError?: boolean;
  deleteError?: boolean;
  lookupError?: boolean;
}) {
  const captured: { updatePayload?: unknown } = {};
  const admin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () =>
                  opts.lookupError
                    ? { data: null, error: new Error("lookup boom") }
                    : opts.ownerUserId === null || opts.ownerUserId === undefined
                      ? { data: null, error: null }
                      : {
                          data: { id: CONV, user_id: opts.ownerUserId },
                          error: null,
                        },
              };
            },
          };
        },
        update(payload: unknown) {
          captured.updatePayload = payload;
          return {
            eq: async () => ({
              error: opts.updateError ? new Error("update boom") : null,
            }),
          };
        },
        delete() {
          return {
            eq: async () => ({
              error: opts.deleteError ? new Error("delete boom") : null,
            }),
          };
        },
      };
    },
  };
  return { admin, captured };
}

function patchReq(body: unknown): Request {
  return new Request(`http://localhost/api/chat/conversations/${CONV}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx(id = CONV) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockRequireAuth.mockResolvedValue({ id: OWNER } as never);
});

describe("PATCH /api/chat/conversations/[id]", () => {
  it("renames a conversation the caller owns", async () => {
    const { admin, captured } = makeAdmin({ ownerUserId: OWNER });
    mockGetAdmin.mockReturnValue(admin as never);

    const res = await PATCH(patchReq({ title: "Visa renewal" }) as never, ctx());
    expect(res.status).toBe(200);
    expect(captured.updatePayload).toEqual({ title: "Visa renewal" });
  });

  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockRejectedValue(new AuthError("UNAUTHORIZED"));
    const { admin } = makeAdmin({ ownerUserId: OWNER });
    mockGetAdmin.mockReturnValue(admin as never);

    const res = await PATCH(patchReq({ title: "x" }) as never, ctx());
    expect(res.status).toBe(401);
  });

  it("400 on invalid uuid", async () => {
    const { admin } = makeAdmin({ ownerUserId: OWNER });
    mockGetAdmin.mockReturnValue(admin as never);

    const res = await PATCH(patchReq({ title: "x" }) as never, ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("400 on empty title", async () => {
    const { admin } = makeAdmin({ ownerUserId: OWNER });
    mockGetAdmin.mockReturnValue(admin as never);

    const res = await PATCH(patchReq({ title: "   " }) as never, ctx());
    expect(res.status).toBe(400);
  });

  it("404 when the conversation does not exist", async () => {
    const { admin } = makeAdmin({ ownerUserId: null });
    mockGetAdmin.mockReturnValue(admin as never);

    const res = await PATCH(patchReq({ title: "x" }) as never, ctx());
    expect(res.status).toBe(404);
  });

  it("403 when another user owns it", async () => {
    const { admin } = makeAdmin({ ownerUserId: "someone-else" });
    mockGetAdmin.mockReturnValue(admin as never);

    const res = await PATCH(patchReq({ title: "x" }) as never, ctx());
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/chat/conversations/[id]", () => {
  it("deletes a conversation the caller owns", async () => {
    const { admin } = makeAdmin({ ownerUserId: OWNER });
    mockGetAdmin.mockReturnValue(admin as never);

    const res = await DELETE(new Request("http://localhost") as never, ctx());
    expect(res.status).toBe(200);
  });

  it("403 when another user owns it", async () => {
    const { admin } = makeAdmin({ ownerUserId: "someone-else" });
    mockGetAdmin.mockReturnValue(admin as never);

    const res = await DELETE(new Request("http://localhost") as never, ctx());
    expect(res.status).toBe(403);
  });

  it("500 when the delete fails", async () => {
    const { admin } = makeAdmin({ ownerUserId: OWNER, deleteError: true });
    mockGetAdmin.mockReturnValue(admin as never);

    const res = await DELETE(new Request("http://localhost") as never, ctx());
    expect(res.status).toBe(500);
  });
});
