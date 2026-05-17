import { describe, expect, it } from "vitest";
import { parseVideo, buildEmbedUrl } from "@/lib/articles/video";

describe("parseVideo — YouTube", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=42", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts id from %s", (url, expected) => {
    const r = parseVideo("youtube", url);
    expect(r).toEqual({ provider: "youtube", videoId: expected });
  });

  it.each([
    "https://www.youtube.com/watch?v=tooShort",
    "https://www.youtube.com/watch?v=way_too_long_id_xx",
    "https://www.youtube.com/watch?v=bad!chars1",
    "https://www.youtube.com/",
    "https://www.youtube.com/playlist?list=PLxxxx",
    "https://evil.com/watch?v=dQw4w9WgXcQ",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(parseVideo("youtube", url)).toBeNull();
  });
});

describe("parseVideo — Vimeo", () => {
  it.each([
    ["https://vimeo.com/123456789", "123456789"],
    ["https://vimeo.com/channels/staff/123456789", "123456789"],
    ["https://vimeo.com/groups/staffpicks/videos/123456789", "123456789"],
    ["https://player.vimeo.com/video/123456789", "123456789"],
  ])("extracts id from %s", (url, expected) => {
    const r = parseVideo("vimeo", url);
    expect(r).toEqual({ provider: "vimeo", videoId: expected });
  });

  it.each([
    "https://vimeo.com/abcdef",
    "https://vimeo.com/",
    "https://evil.com/123456789",
    "javascript:alert(1)",
    "",
  ])("rejects %s", (url) => {
    expect(parseVideo("vimeo", url)).toBeNull();
  });
});

describe("parseVideo — invalid provider / missing", () => {
  it("returns null when provider is null/undefined/unknown", () => {
    expect(parseVideo(null, "https://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(parseVideo(undefined, "https://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(parseVideo("dailymotion", "https://youtu.be/dQw4w9WgXcQ")).toBeNull();
  });
  it("returns null when url is null/undefined/empty", () => {
    expect(parseVideo("youtube", null)).toBeNull();
    expect(parseVideo("youtube", undefined)).toBeNull();
    expect(parseVideo("youtube", "")).toBeNull();
  });
});

describe("buildEmbedUrl", () => {
  it("builds youtube-nocookie embed for YouTube", () => {
    expect(
      buildEmbedUrl({ provider: "youtube", videoId: "dQw4w9WgXcQ" }),
    ).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
  });
  it("builds player.vimeo embed with dnt for Vimeo", () => {
    expect(buildEmbedUrl({ provider: "vimeo", videoId: "123456789" })).toBe(
      "https://player.vimeo.com/video/123456789?dnt=1",
    );
  });
});
