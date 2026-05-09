export type AuthErrorCode = "UNAUTHORIZED" | "FORBIDDEN";

export class AuthError extends Error {
  status: number;
  code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AuthError";
    this.code = code;
    this.status = code === "UNAUTHORIZED" ? 401 : 403;
  }
}
