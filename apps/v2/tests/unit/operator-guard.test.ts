import { describe, expect, it } from "vitest";
import {
  canForceRelease,
  canSendOperatorMessage,
  canTakeOverChannel,
  interpretRelease,
  interpretTakeover,
} from "@/lib/admin/operator-guard";

// P2-B2. The RPC in migration 010 performs the state change; these are
// the pure translations of its outcome into an API result. They exist
// as functions precisely so the branches are testable without a DB.

describe("interpretTakeover", () => {
  it("accepts a fresh takeover", () => {
    expect(interpretTakeover("taken")).toEqual({ allowed: true });
  });

  it("treats re-taking your own conversation as success (idempotent)", () => {
    // Double-clicking the button must not surface an error; the RPC
    // deliberately wrote no second log row for this case.
    expect(interpretTakeover("already_self")).toEqual({ allowed: true });
  });

  it("rejects a conversation held by another operator with 409", () => {
    const r = interpretTakeover("conflict");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("CONFLICT");
  });

  it("maps a missing conversation to 404", () => {
    const r = interpretTakeover("not_found");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("NOT_FOUND");
  });
});

describe("interpretRelease", () => {
  it("accepts a real release", () => {
    expect(interpretRelease("released")).toEqual({ allowed: true });
  });

  it("treats releasing an already-auto conversation as success", () => {
    expect(interpretRelease("already_auto")).toEqual({ allowed: true });
  });

  it("rejects releasing someone else's conversation without force", () => {
    const r = interpretRelease("conflict");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("CONFLICT");
  });

  it("maps a missing conversation to 404", () => {
    const r = interpretRelease("not_found");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("NOT_FOUND");
  });
});

describe("canForceRelease", () => {
  it("allows admins (the only recovery path from a forgotten takeover)", () => {
    expect(canForceRelease("admin")).toBe(true);
  });

  it("denies editors", () => {
    expect(canForceRelease("editor")).toBe(false);
  });
});

describe("canSendOperatorMessage", () => {
  const actor = "11111111-1111-1111-1111-111111111111";
  const other = "22222222-2222-2222-2222-222222222222";

  it("allows the holder to reply", () => {
    expect(
      canSendOperatorMessage({
        mode: "operator",
        operatorUserId: actor,
        actorUserId: actor,
      }),
    ).toEqual({ allowed: true });
  });

  it("refuses to inject a human turn into an AI-driven thread", () => {
    const r = canSendOperatorMessage({
      mode: "auto",
      operatorUserId: null,
      actorUserId: actor,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("CONFLICT");
  });

  it("refuses when another operator holds the thread", () => {
    const r = canSendOperatorMessage({
      mode: "operator",
      operatorUserId: other,
      actorUserId: actor,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("CONFLICT");
  });

  it("refuses when the mode says operator but nobody holds it", () => {
    // Shouldn't happen (the RPC always sets both together), but a NULL
    // holder must not read as "anyone may reply".
    const r = canSendOperatorMessage({
      mode: "operator",
      operatorUserId: null,
      actorUserId: actor,
    });
    expect(r.allowed).toBe(false);
  });
});

describe("canTakeOverChannel", () => {
  it("allows web conversations", () => {
    expect(canTakeOverChannel("web")).toEqual({ allowed: true });
  });

  it("blocks messenger — a reply there has no path back to the user", () => {
    const r = canTakeOverChannel("messenger");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("CONFLICT");
  });
});
