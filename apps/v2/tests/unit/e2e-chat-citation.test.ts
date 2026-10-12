// Run the real Playwright scenario against a tiny synthetic page adapter.
// This verifies its assertion contract, not DOM rendering or a live AI reply.
import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeLocator = { citation?: boolean; first: () => FakeLocator; locator: () => FakeLocator; count: () => Promise<number> };
const h = vi.hoisted(() => ({ scenario: null as null | ((args: { page: unknown }) => Promise<void>), count: 0 }));
vi.mock("@playwright/test", () => ({
  test: (_name: string, scenario: typeof h.scenario) => { h.scenario = scenario; },
  expect: (locator: FakeLocator) => ({
    toBeVisible: async () => { if (locator.citation && h.count === 0) throw new Error("Expected citation to be visible"); },
    toContainText: async () => {},
  }),
}));
import "../e2e/chat-happy-path.spec";

function locator(citation = false): FakeLocator {
  const result = { citation, first: () => result, locator: () => result, count: async () => h.count,
    fill: async () => {}, click: async () => {} };
  return result;
}
const page = {
  goto: async () => {}, getByRole: () => locator(), getByPlaceholder: () => locator(),
  getByText: () => locator(), locator: () => locator(true),
};
beforeEach(() => { h.count = 0; });
describe("E2E happy-path citation assertion", () => {
  it("fails if an otherwise successful streamed answer has zero citations", async () => {
    await expect(h.scenario!({ page })).rejects.toThrow(/citation/);
  });
  it("accepts a visible citation for a supported answer", async () => {
    h.count = 1;
    await expect(h.scenario!({ page })).resolves.toBeUndefined();
  });
});
