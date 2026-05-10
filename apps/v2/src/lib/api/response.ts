import { NextResponse } from "next/server";

// Wire format for /api responses, kept consistent across admin and public
// endpoints so the client can branch on `ok` without remembering shapes.
//   success: { ok: true, data: T }
//   failure: { ok: false, error: { code, message? } }
export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

const STATUS_FOR: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export function ok<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(
    { ok: true as const, data },
    { status: init?.status ?? 200 },
  );
}

export function fail(code: ApiErrorCode, message?: string) {
  return NextResponse.json(
    { ok: false as const, error: { code, message } },
    { status: STATUS_FOR[code] },
  );
}
