import { describe, expect, it } from "vitest";
import {
  OPERATOR_TURN_PREFIX,
  selectHistoryWindow,
  toHistoryTurns,
} from "@/lib/chat/persistence";

// P2-B2 follow-up. The role mapping decides what the model believes it
// previously said, so it carries the individual-advice boundary with it.
// Rows arrive newest-first (the query bounds the result set with DESC +
// LIMIT) and must come back chronological.

describe("toHistoryTurns", () => {
  it("returns turns in chronological order", () => {
    expect(
      toHistoryTurns([
        { role: "assistant", content: "second" },
        { role: "user", content: "first" },
      ]),
    ).toEqual([
      { role: "user", text: "first" },
      { role: "model", text: "second" },
    ]);
  });

  it("maps assistant to model and everything else to user", () => {
    expect(toHistoryTurns([{ role: "assistant", content: "a" }])).toEqual([
      { role: "model", text: "a" },
    ]);
    expect(toHistoryTurns([{ role: "user", content: "u" }])).toEqual([
      { role: "user", text: "u" },
    ]);
  });

  it("includes operator turns so the AI knows what staff told the user", () => {
    // The regression this guards: staff answer, staff release the thread,
    // user asks a follow-up, and the AI answers as if the exchange never
    // happened.
    const turns = toHistoryTurns([
      { role: "operator", content: "在留カードを持って窓口へお越しください" },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe("model");
    expect(turns[0].text).toContain("在留カードを持って窓口へお越しください");
  });

  it("labels operator turns rather than passing them off as the model's own", () => {
    // Without the marker the model sees its own past self giving
    // individual advice, which invites it to keep doing so — the exact
    // boundary rule 1 of the system prompt holds.
    const [turn] = toHistoryTurns([{ role: "operator", content: "x" }]);
    expect(turn.text.startsWith(OPERATOR_TURN_PREFIX)).toBe(true);
  });

  it("does not label assistant turns", () => {
    const [turn] = toHistoryTurns([{ role: "assistant", content: "x" }]);
    expect(turn.text).toBe("x");
  });

  it("keeps a mixed human/AI thread in order with only the human turns labelled", () => {
    const turns = toHistoryTurns([
      { role: "user", content: "q2" },
      { role: "operator", content: "staff reply" },
      { role: "assistant", content: "ai reply" },
      { role: "user", content: "q1" },
    ]);
    expect(turns.map((t) => t.role)).toEqual(["user", "model", "model", "user"]);
    expect(turns[1].text).toBe("ai reply");
    expect(turns[2].text).toBe(`${OPERATOR_TURN_PREFIX}staff reply`);
  });

  it("does not mutate the caller's array", () => {
    // The loader passes the query result straight in; reversing in place
    // would corrupt it for anything else holding the reference.
    const rows = [
      { role: "user", content: "b" },
      { role: "user", content: "a" },
    ];
    toHistoryTurns(rows);
    expect(rows[0].content).toBe("b");
  });

  it("handles an empty thread", () => {
    expect(toHistoryTurns([])).toEqual([]);
  });
});

// The window is a character budget rather than a turn count. A fixed
// 10 rows was cutting conversations that cost nothing to keep —
// production's longest thread is 1,228 characters in total — and P2-B2
// made operator turns compete for the same slots, so a few staff
// replies could push the user's original question out of view.
describe("selectHistoryWindow", () => {
  const row = (content: string) => ({ content });

  it("keeps everything when the whole conversation fits", () => {
    const rows = [row("aaa"), row("bbb"), row("ccc")];
    expect(selectHistoryWindow(rows, 100)).toEqual(rows);
  });

  it("stops at the budget, keeping the newest turns", () => {
    // Input is newest-first, so the oldest turns are the ones dropped.
    const rows = [row("12345"), row("12345"), row("12345")];
    expect(selectHistoryWindow(rows, 10)).toHaveLength(2);
  });

  it("counts characters, not rows — many short turns all survive", () => {
    const rows = Array.from({ length: 40 }, () => row("はい"));
    expect(selectHistoryWindow(rows, 12_000)).toHaveLength(40);
  });

  it("counts characters, not rows — few long turns get cut", () => {
    const rows = Array.from({ length: 5 }, () => row("x".repeat(2_000)));
    expect(selectHistoryWindow(rows, 5_000)).toHaveLength(2);
  });

  it("never returns empty: the newest turn survives even if oversized", () => {
    // Dropping the immediate context to satisfy a budget would be worse
    // than one oversized turn.
    const rows = [row("x".repeat(50_000)), row("older")];
    expect(selectHistoryWindow(rows, 100)).toHaveLength(1);
  });

  it("handles an empty conversation", () => {
    expect(selectHistoryWindow([], 12_000)).toEqual([]);
  });

  it("does not mutate the caller's array", () => {
    const rows = [row("a"), row("b"), row("c")];
    selectHistoryWindow(rows, 1);
    expect(rows).toHaveLength(3);
  });

  it("keeps a staff-heavy thread from evicting the user's first question", () => {
    // The P2-B2 regression this guards: operator replies are dialogue
    // now, and under a row cap they crowd out the question being asked.
    const rows = [
      row("staff reply 5"),
      row("staff reply 4"),
      row("staff reply 3"),
      row("staff reply 2"),
      row("staff reply 1"),
      row("ビザの更新について教えてください"),
    ];
    const kept = selectHistoryWindow(rows, 12_000);
    expect(kept).toHaveLength(6);
    expect(kept[kept.length - 1].content).toContain("ビザの更新");
  });
});
