import type { ApiErrorCode } from "@/lib/api/response";

// P2-B2. Decision logic for operator takeover / release / messaging,
// kept as pure functions so the branches are unit-testable without a
// Supabase mock (W3 Lesson 14: guards live outside the route handler).
//
// The RPCs in migration 010 do the atomic state change and hand back an
// `outcome` string; these functions translate that outcome — and the
// caller's role — into the API result. Nothing here touches the DB.

export type TakeoverOutcome =
  | "taken"
  | "already_self"
  | "conflict"
  | "not_found";

export type ReleaseOutcome =
  | "released"
  | "already_auto"
  | "conflict"
  | "not_found";

export type ConversationMode = "auto" | "operator";

export type GuardResult =
  | { allowed: true }
  | { allowed: false; code: ApiErrorCode; message: string };

const ALLOWED: GuardResult = { allowed: true };

/**
 * `already_self` is a success: re-clicking "take over" on a conversation
 * you already hold must not be an error, and the RPC deliberately wrote
 * no duplicate log row for it (idempotency, design §4).
 */
export function interpretTakeover(outcome: TakeoverOutcome): GuardResult {
  switch (outcome) {
    case "taken":
    case "already_self":
      return ALLOWED;
    case "conflict":
      return {
        allowed: false,
        code: "CONFLICT",
        message: "この会話は別の担当者が対応中です",
      };
    case "not_found":
      return { allowed: false, code: "NOT_FOUND", message: "会話が見つかりません" };
  }
}

/** `already_auto` is likewise a no-op success. */
export function interpretRelease(outcome: ReleaseOutcome): GuardResult {
  switch (outcome) {
    case "released":
    case "already_auto":
      return ALLOWED;
    case "conflict":
      return {
        allowed: false,
        code: "CONFLICT",
        message: "この会話は別の担当者が対応中です",
      };
    case "not_found":
      return { allowed: false, code: "NOT_FOUND", message: "会話が見つかりません" };
  }
}

/**
 * An admin may force-release a conversation held by someone else. That
 * is the only recovery path when an operator walks away mid-takeover —
 * there is no auto-release cron by design (design §10-c), so without
 * this the conversation would stay AI-silenced forever.
 */
export function canForceRelease(role: "admin" | "editor"): boolean {
  return role === "admin";
}

/**
 * Operator replies are only accepted while the conversation is actually
 * in operator mode AND held by the sender. Writing an `operator` message
 * into an `auto` conversation would put a human turn into a thread the
 * AI is still answering — two voices, no ownership.
 */
export function canSendOperatorMessage(args: {
  mode: ConversationMode;
  operatorUserId: string | null;
  actorUserId: string;
}): GuardResult {
  if (args.mode !== "operator") {
    return {
      allowed: false,
      code: "CONFLICT",
      message: "先に「対応を引き取る」を実行してください",
    };
  }
  if (args.operatorUserId !== args.actorUserId) {
    return {
      allowed: false,
      code: "CONFLICT",
      message: "この会話は別の担当者が対応中です",
    };
  }
  return ALLOWED;
}

/**
 * Messenger conversations are out of scope: a reply written here has no
 * path back to Facebook (that send route depends on FB app review), so
 * the operator would be talking into the void. Web only for now
 * (design §10-e).
 */
export function canTakeOverChannel(channel: string): GuardResult {
  if (channel !== "web") {
    return {
      allowed: false,
      code: "CONFLICT",
      message: "Messenger の会話は現在この画面から対応できません",
    };
  }
  return ALLOWED;
}
