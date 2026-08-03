import { describe, expect, it } from "vitest";
import {
  OPERATOR_TURN_PREFIX,
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
