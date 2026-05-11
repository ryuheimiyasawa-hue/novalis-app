import { describe, expect, it } from "vitest";
import { parseSseFrames } from "@/lib/chat/sse-client";

describe("parseSseFrames", () => {
  it("returns no events for an empty buffer", () => {
    const r = parseSseFrames("");
    expect(r.events).toEqual([]);
    expect(r.remainder).toBe("");
  });

  it("parses a single complete data frame", () => {
    const buf = `data: {"type":"meta","conversationId":"abc"}\n\n`;
    const r = parseSseFrames(buf);
    expect(r.events).toEqual([{ type: "meta", conversationId: "abc" }]);
    expect(r.remainder).toBe("");
  });

  it("parses multiple frames in one buffer", () => {
    const buf =
      `data: {"type":"meta","conversationId":"c1"}\n\n` +
      `data: {"type":"token","text":"hi"}\n\n` +
      `data: {"type":"done","kind":"answer"}\n\n`;
    const r = parseSseFrames(buf);
    expect(r.events).toHaveLength(3);
    expect((r.events[1] as { text: string }).text).toBe("hi");
    expect(r.remainder).toBe("");
  });

  it("leaves an incomplete trailing frame in remainder", () => {
    const buf =
      `data: {"type":"token","text":"first"}\n\n` +
      `data: {"type":"token","text":"sec`;
    const r = parseSseFrames(buf);
    expect(r.events).toHaveLength(1);
    expect(r.remainder).toBe(`data: {"type":"token","text":"sec`);
  });

  it("skips frames without a data: prefix", () => {
    const buf = `event: ping\n\ndata: {"type":"token","text":"ok"}\n\n`;
    const r = parseSseFrames(buf);
    expect(r.events).toHaveLength(1);
    expect((r.events[0] as { text: string }).text).toBe("ok");
  });

  it("ignores malformed JSON payloads instead of throwing", () => {
    const buf = `data: {not json}\n\ndata: {"type":"token","text":"ok"}\n\n`;
    const r = parseSseFrames(buf);
    expect(r.events).toHaveLength(1);
  });

  it("supports being called repeatedly with growing buffers (streaming use)", () => {
    let buffer = "";
    const events: unknown[] = [];

    function feed(chunk: string) {
      buffer += chunk;
      const r = parseSseFrames(buffer);
      buffer = r.remainder;
      events.push(...r.events);
    }

    feed(`data: {"type":"meta"`);
    feed(`,"conversationId":"abc"}\n\n`);
    feed(`data: {"type":"token","text":"`);
    feed(`hello"}\n\n`);

    expect(events).toEqual([
      { type: "meta", conversationId: "abc" },
      { type: "token", text: "hello" },
    ]);
    expect(buffer).toBe("");
  });
});
