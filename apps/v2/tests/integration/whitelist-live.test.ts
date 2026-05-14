import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { classifyIndividualLLM } from "@/lib/ai/whitelist-llm";
import {
  detectIndividualKeywords,
  type WhitelistLocale,
} from "@/lib/ai/whitelist-keywords";

// Live integration probe against the real Gemini API. Skipped by
// default — set RUN_LIVE_GEMINI=1 to opt in:
//
//   RUN_LIVE_GEMINI=1 pnpm test tests/integration/whitelist-live
//
// What it does:
//   - Loads the 30-case fixture
//   - For each case, runs the keyword stage; if it fires we record the
//     pre-LLM escalation, otherwise we call Gemini Flash JSON-mode
//     classifier and record the result.
//   - Reports a per-case table and a summary (accuracy, latency p50 /
//     p95 / max, total tokens) at the end.
//
// Cost note: 30 calls at ~150 input tokens / ~30 output tokens =
// ~5400 tokens total = well under the daily Free-tier quota.
// First-run finding (D-4): Gemini 2.5 Flash Free-tier RPM is 5 (not
// 15 as initially assumed). We pace at 13s between LLM calls
// (~4.6 RPM) to stay safely under the limit.

const SHOULD_RUN = process.env.RUN_LIVE_GEMINI === "1";

// Minimal .env.local loader so we don't add a dotenv dep just for this
// one optional script. Only runs when the probe is enabled.
function loadEnvLocal(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

if (SHOULD_RUN) loadEnvLocal();

type Verdict = "answer" | "escalate" | "smalltalk";

interface FixtureCase {
  input: string;
  locale: WhitelistLocale;
  expected: Verdict;
  category: "individual" | "general" | "gray" | "smalltalk";
  notes?: string;
}

interface RunRow {
  idx: number;
  category: string;
  locale: string;
  input: string;
  expected: Verdict;
  stage: "keyword" | "llm" | "llm-failsafe";
  classifierCategory: "individual" | "general" | "smalltalk";
  reason: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  correct: boolean;
}

const rows: RunRow[] = [];

function loadFixture(): FixtureCase[] {
  const file = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "whitelist-cases.json",
  );
  return JSON.parse(fs.readFileSync(file, "utf-8")) as FixtureCase[];
}

function p(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((q / 100) * sorted.length),
  );
  return sorted[idx];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!SHOULD_RUN)("whitelist live probe (Gemini API)", () => {
  const fixture = SHOULD_RUN ? loadFixture() : [];

  it("runs the integrated KW + LLM pipeline against the fixture", async () => {
    for (let i = 0; i < fixture.length; i++) {
      const c = fixture[i];
      const kw = detectIndividualKeywords(c.input, c.locale);
      let stage: RunRow["stage"];
      let classifierCategory: RunRow["classifierCategory"];
      let reason: string;
      let latencyMs = 0;
      let tokensIn = 0;
      let tokensOut = 0;

      if (kw) {
        stage = "keyword";
        classifierCategory = "individual";
        reason = `kw:${kw.keyword}`;
      } else {
        const r = await classifyIndividualLLM(c.input, c.locale);
        stage = r.failsafe ? "llm-failsafe" : "llm";
        classifierCategory = r.category;
        reason = r.reason;
        latencyMs = r.latencyMs;
        tokensIn = r.tokensIn;
        tokensOut = r.tokensOut;
        // Pace LLM calls — Free-tier 2.5-flash RPM cap is 5.
        await sleep(13_000);
      }

      const actualVerdict: Verdict =
        classifierCategory === "individual"
          ? "escalate"
          : classifierCategory === "smalltalk"
            ? "smalltalk"
            : "answer";
      rows.push({
        idx: i + 1,
        category: c.category,
        locale: c.locale,
        input: c.input.slice(0, 60),
        expected: c.expected,
        stage,
        classifierCategory,
        reason: reason.slice(0, 80),
        latencyMs,
        tokensIn,
        tokensOut,
        correct: actualVerdict === c.expected,
      });
    }

    expect(rows.length).toBe(fixture.length);
  }, /* per-test timeout */ 600_000);

  afterAll(() => {
    if (rows.length === 0) return;

    // Per-case table.
    console.log("\n=== Whitelist live probe — per case ===");
    const verdictOf = (r: RunRow): Verdict =>
      r.classifierCategory === "individual"
        ? "escalate"
        : r.classifierCategory === "smalltalk"
          ? "smalltalk"
          : "answer";

    console.table(
      rows.map((r) => ({
        "#": r.idx,
        cat: r.category,
        loc: r.locale,
        exp: r.expected,
        stage: r.stage,
        verdict: verdictOf(r),
        ok: r.correct ? "✓" : "✗",
        ms: r.latencyMs || "-",
        tok: r.tokensIn ? `${r.tokensIn}/${r.tokensOut}` : "-",
        input: r.input,
      })),
    );

    // Wrong cases highlighted.
    const wrong = rows.filter((r) => !r.correct);
    if (wrong.length > 0) {
      console.log("\n=== Wrong classifications ===");
      console.table(
        wrong.map((r) => ({
          "#": r.idx,
          cat: r.category,
          loc: r.locale,
          exp: r.expected,
          got: verdictOf(r),
          stage: r.stage,
          reason: r.reason,
          input: r.input,
        })),
      );
    }

    // Summary.
    const llmRows = rows.filter((r) => r.stage !== "keyword");
    const latencies = llmRows.map((r) => r.latencyMs);
    const totalTokensIn = rows.reduce((a, b) => a + b.tokensIn, 0);
    const totalTokensOut = rows.reduce((a, b) => a + b.tokensOut, 0);
    console.log("\n=== Summary ===");
    console.table([
      {
        cases: rows.length,
        accuracy: `${rows.filter((r) => r.correct).length}/${rows.length}`,
        kw_hits: rows.filter((r) => r.stage === "keyword").length,
        llm_calls: llmRows.length,
        llm_failsafes: rows.filter((r) => r.stage === "llm-failsafe").length,
        latency_p50: p(latencies, 50),
        latency_p95: p(latencies, 95),
        latency_max: Math.max(0, ...latencies),
        tokens_in_total: totalTokensIn,
        tokens_out_total: totalTokensOut,
      },
    ]);
  });
});
