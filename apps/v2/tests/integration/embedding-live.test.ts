import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { embed } from "@/lib/ai/embedding";

// Live probe for the W5 E-1 embedding wrapper. Skipped by default;
// opt in with RUN_LIVE_GEMINI_EMBED=1.
//
// Purpose at W5 E-1 STOP 1:
//   1. Confirm gemini-embedding-001 is reachable and returns a vector
//   2. Measure latency (target: <300ms per W5 §10)
//   3. Verify outputDimensionality=768 actually gives a 768-element
//      array
//   4. Determine whether embedding quota is shared with the generation
//      RPD/RPM caps from D-4 (Lesson 15). If this run succeeds while
//      generation RPD is exhausted, the quotas are separate.
//   5. Confirm taskType is accepted

const SHOULD_RUN = process.env.RUN_LIVE_GEMINI_EMBED === "1";

function loadEnvLocal(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf-8").split("\n")) {
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

interface ProbeRow {
  label: string;
  ok: boolean;
  dim: number;
  latencyMs: number;
  err?: string;
}

const rows: ProbeRow[] = [];

async function probe(
  label: string,
  text: string,
  opts: Parameters<typeof embed>[1],
): Promise<void> {
  try {
    const r = await embed(text, opts);
    rows.push({ label, ok: true, dim: r.dim, latencyMs: r.latencyMs });
  } catch (e) {
    rows.push({
      label,
      ok: false,
      dim: 0,
      latencyMs: 0,
      err: e instanceof Error ? e.message.slice(0, 200) : String(e),
    });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!SHOULD_RUN)("embedding live probe (Gemini API)", () => {
  it("runs 3 probes covering retrieval query / document / default", async () => {
    // Pace ~13s apart to stay below any RPM cap we haven't measured.
    await probe(
      "RETRIEVAL_QUERY 768d",
      "在留資格更新の手続きを教えてください",
      { taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 },
    );
    await sleep(13_000);

    await probe(
      "RETRIEVAL_DOCUMENT 768d (with title)",
      "日本に中長期で滞在する外国人は、在留期間の満了前に「在留期間更新許可申請」を行う必要があります。",
      {
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: 768,
        title: "在留資格更新の基本手続き",
      },
    );
    await sleep(13_000);

    await probe("default (no taskType) 768d", "How long is a working visa?", {
      outputDimensionality: 768,
    });

    expect(rows.length).toBe(3);
  }, 600_000);

  afterAll(() => {
    if (rows.length === 0) return;
    console.log("\n=== Embedding live probe ===");
    console.table(
      rows.map((r) => ({
        case: r.label,
        ok: r.ok ? "✓" : "✗",
        dim: r.ok ? r.dim : "-",
        ms: r.ok ? r.latencyMs : "-",
        err: r.err ?? "",
      })),
    );

    const successes = rows.filter((r) => r.ok);
    const latencies = successes.map((r) => r.latencyMs);
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    console.log("\n=== Summary ===");
    console.table([
      {
        probes: rows.length,
        succeeded: successes.length,
        all_dims_768: successes.every((r) => r.dim === 768) ? "✓" : "✗",
        latency_p50: sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] ?? 0,
        latency_max: Math.max(0, ...latencies),
      },
    ]);

    const has429 = rows.some((r) => !r.ok && /429/.test(r.err ?? ""));
    console.log(
      `\nQuota observation: ${
        has429
          ? "AT LEAST ONE 429 — embedding quota may be shared with generation, or its own cap is low"
          : "all probes succeeded — embedding quota is separate from / larger than generation (which is currently exhausted)"
      }`,
    );
  });
});
