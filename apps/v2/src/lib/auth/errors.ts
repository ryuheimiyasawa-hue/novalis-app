export type AuthErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "STALE_CONSENT"
  | "ONBOARDING_REQUIRED";

export class AuthError extends Error {
  status: number;
  code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AuthError";
    this.code = code;
    this.status =
      code === "UNAUTHORIZED" ? 401 :
      code === "STALE_CONSENT" ? 412 :
      code === "ONBOARDING_REQUIRED" ? 409 :
      403;
  }
}
