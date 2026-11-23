import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RestaurantApplicationSchema,
  clientIp,
  hashIp,
} from "@/lib/restaurant-applications/schema";

const valid = {
  name: "Kainan Manila",
  prefecture_code: "JP-13",
  city_name: "新宿区",
  contact_name: "Maria",
  contact_email: "maria@example.com",
  consent: true,
};

describe("RestaurantApplicationSchema", () => {
  it("accepts the minimum required fields and nulls the optional ones", () => {
    const r = RestaurantApplicationSchema.parse(valid);
    expect(r.address).toBeNull();
    expect(r.phone).toBeNull();
    expect(r.website_url).toBeNull();
    expect(r.source_code).toBeNull();
    expect(r.description_lang).toBe("ja");
  });

  it("turns blank optional strings into null", () => {
    const r = RestaurantApplicationSchema.parse({ ...valid, address: "  ", phone: "", website_url: "" });
    expect(r.address).toBeNull();
    expect(r.phone).toBeNull();
    expect(r.website_url).toBeNull();
  });

  it("normalises a website without scheme or with http to https", () => {
    expect(RestaurantApplicationSchema.parse({ ...valid, website_url: "facebook.com/kainan" }).website_url)
      .toBe("https://facebook.com/kainan");
    expect(RestaurantApplicationSchema.parse({ ...valid, website_url: "http://kainan.jp" }).website_url)
      .toBe("https://kainan.jp");
  });

  it.each([
    ["name", { name: "" }],
    ["name", { name: "あ".repeat(101) }],
    ["prefecture_code", { prefecture_code: "JP-48" }],
    ["city_name", { city_name: " " }],
    ["phone", { phone: "call me" }],
    ["website_url", { website_url: "javascript:alert(1)" }],
    ["website_url", { website_url: "not a url" }],
    ["description", { description: "x".repeat(1001) }],
    ["contact_email", { contact_email: "nope" }],
    ["consent", { consent: false }],
    ["source_code", { source_code: "bad code!" }],
  ])("rejects a bad %s", (field, patch) => {
    const r = RestaurantApplicationSchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path[0]).toBe(field);
  });

  it("keeps Tagalog, emoji and Japanese text intact", () => {
    const r = RestaurantApplicationSchema.parse({
      ...valid,
      name: "Lutong Bahay 🇵🇭 フィリピン食堂",
      description: "Masarap na adobo at sinigang!",
      description_lang: "tl",
    });
    expect(r.name).toBe("Lutong Bahay 🇵🇭 フィリピン食堂");
    expect(r.description_lang).toBe("tl");
  });
});

describe("clientIp / hashIp", () => {
  it("takes the first x-forwarded-for hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });
  it("falls back to one shared bucket when no header is present", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
  it("hashes deterministically per secret and never returns the raw IP", () => {
    const a = hashIp("1.2.3.4", "s1");
    expect(a).toBe(hashIp("1.2.3.4", "s1"));
    expect(a).not.toBe(hashIp("1.2.3.4", "s2"));
    expect(a).not.toContain("1.2.3.4");
  });
});

// --- route ---------------------------------------------------------------

const state = vi.hoisted(() => ({
  count: 0,
  countError: null as null | { message: string },
  insertError: null as null | { code?: string; message: string },
  inserted: [] as unknown[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: async () => ({ count: state.count, error: state.countError }),
        }),
      }),
      insert: async (row: unknown) => {
        if (!state.insertError) state.inserted.push(row);
        return { error: state.insertError };
      },
    }),
  }),
}));

async function post(body: unknown) {
  const { POST } = await import("@/app/api/restaurant-applications/route");
  const req = new Request("http://localhost/api/restaurant-applications", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(req as any);
}

describe("POST /api/restaurant-applications", () => {
  beforeEach(() => {
    state.count = 0;
    state.countError = null;
    state.insertError = null;
    state.inserted = [];
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("stores a valid application as pending input and answers 201", async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(state.inserted).toHaveLength(1);
    const row = state.inserted[0] as Record<string, unknown>;
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row).not.toHaveProperty("consent");
    expect(row).not.toHaveProperty("company_website");
  });

  it("names the failing field on invalid input", async () => {
    const res = await post({ ...valid, contact_email: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("contact_email");
  });

  it("rejects broken JSON and oversized bodies", async () => {
    expect((await post("{")).status).toBe(400);
    expect((await post({ ...valid, description: "x".repeat(20_000) })).status).toBe(400);
  });

  it("drops honeypot submissions silently", async () => {
    const res = await post({ ...valid, company_website: "spam" });
    expect(res.status).toBe(201);
    expect(state.inserted).toHaveLength(0);
  });

  it("rate limits after 5 submissions an hour from one IP", async () => {
    state.count = 5;
    const res = await post(valid);
    expect(res.status).toBe(429);
    expect(state.inserted).toHaveLength(0);
  });

  it("answers already_received for a duplicate pending shop", async () => {
    state.insertError = { code: "23505", message: "duplicate" };
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("already_received");
  });

  it("returns 500 and logs when the database fails", async () => {
    state.countError = { message: "connection refused" };
    expect((await post(valid)).status).toBe(500);
    state.countError = null;
    state.insertError = { message: "timeout" };
    expect((await post(valid)).status).toBe(500);
  });
});
