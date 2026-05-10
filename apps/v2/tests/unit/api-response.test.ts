import { describe, expect, it } from "vitest";
import { ok, fail } from "@/lib/api/response";

async function bodyOf(res: Response) {
  return JSON.parse(await res.text());
}

describe("ok()", () => {
  it("returns 200 with { ok: true, data } by default", async () => {
    const res = ok({ hello: "world" });
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body).toEqual({ ok: true, data: { hello: "world" } });
  });

  it("honours an explicit status (e.g. 201 for create)", async () => {
    const res = ok({ id: "abc" }, { status: 201 });
    expect(res.status).toBe(201);
  });

  it("returns Content-Type: application/json", async () => {
    const res = ok({});
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});

describe("fail()", () => {
  it("maps each error code to the expected HTTP status", async () => {
    const cases: Array<[Parameters<typeof fail>[0], number]> = [
      ["UNAUTHORIZED", 401],
      ["FORBIDDEN", 403],
      ["INVALID_INPUT", 400],
      ["NOT_FOUND", 404],
      ["CONFLICT", 409],
      ["RATE_LIMITED", 429],
      ["INTERNAL_ERROR", 500],
    ];
    for (const [code, status] of cases) {
      const res = fail(code);
      expect(res.status, `code=${code}`).toBe(status);
      const body = await bodyOf(res);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe(code);
    }
  });

  it("includes the optional message in the body", async () => {
    const res = fail("INVALID_INPUT", "slug cannot be empty");
    const body = await bodyOf(res);
    expect(body.error.message).toBe("slug cannot be empty");
  });

  it("omits message when not given", async () => {
    const res = fail("NOT_FOUND");
    const body = await bodyOf(res);
    expect(body.error).toEqual({ code: "NOT_FOUND" });
  });
});
