import { describe, it, expect } from "vitest";
import { unlinkedGuidance, LINKED_REPLY } from "@/lib/messenger/unlinked-reply";

describe("unlinkedGuidance", () => {
  const text = unlinkedGuidance("https://example.test");

  it("leads with Tagalog and links each language's linking page", () => {
    expect(text.split("\n")[0]).toMatch(/^Kumusta!/);
    expect(text).toContain("https://example.test/tl/messenger");
    expect(text).toContain("https://example.test/en/messenger");
    expect(text).toContain("https://example.test/ja/messenger");
  });

  it("stays within Messenger's 2000-character limit", () => {
    expect(text.length).toBeLessThan(2000);
    expect(LINKED_REPLY.length).toBeLessThan(2000);
  });
});
