// Manual reindex CLI for W5 RAG embeddings.
//
//   pnpm reindex all           # all published articles + is_published faqs
//   pnpm reindex article <id>  # one article
//   pnpm reindex faq <id>      # one FAQ
//
// Loads .env.local for GEMINI_API_KEY / SUPABASE_* before importing
// modules that read them. The bare-minimum env loader avoids adding
// dotenv as a runtime dependency.
//
// Everything sits inside main() so tsx can transpile to CJS without
// hitting the "top-level await not supported with cjs output" error
// (tsx defaults to CJS for .ts files without "type": "module").

import fs from "node:fs";
import path from "node:path";

function loadEnvLocal(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) {
    console.warn("[reindex] .env.local not found in cwd; relying on process env");
    return;
  }
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

async function main(): Promise<number> {
  loadEnvLocal();

  // Lazy import after env vars are loaded so the supabase admin
  // singleton picks up the credentials.
  const { reindexAll, reindexArticle, reindexFaq } = await import(
    "../src/lib/ai/reindex"
  );

  const [, , mode, id] = process.argv;

  if (!mode || (mode !== "all" && mode !== "article" && mode !== "faq")) {
    console.error(
      "Usage:\n  pnpm reindex all\n  pnpm reindex article <id>\n  pnpm reindex faq <id>",
    );
    return 1;
  }
  if ((mode === "article" || mode === "faq") && !id) {
    console.error(`Usage: pnpm reindex ${mode} <id>`);
    return 1;
  }

  const startedAt = Date.now();
  let totalChunks = 0;
  let totalEmbedCalls = 0;
  let rowsTouched = 0;

  if (mode === "all") {
    console.log("[reindex] starting full rebuild");
    for await (const r of reindexAll()) {
      rowsTouched++;
      totalChunks += r.chunks_inserted;
      totalEmbedCalls += r.embed_calls;
      console.log(
        `[reindex] ${r.source_type} ${r.source_id} -> ${r.chunks_inserted} chunks (${r.embed_calls} embed calls)`,
      );
    }
  } else if (mode === "article") {
    const r = await reindexArticle(id!);
    rowsTouched = 1;
    totalChunks = r.chunks_inserted;
    totalEmbedCalls = r.embed_calls;
    console.log(
      `[reindex] article ${r.source_id} -> ${r.chunks_inserted} chunks`,
    );
  } else if (mode === "faq") {
    const r = await reindexFaq(id!);
    rowsTouched = 1;
    totalChunks = r.chunks_inserted;
    totalEmbedCalls = r.embed_calls;
    console.log(`[reindex] faq ${r.source_id} -> ${r.chunks_inserted} chunks`);
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[reindex] done rows=${rowsTouched} chunks=${totalChunks} embed_calls=${totalEmbedCalls} elapsed=${elapsedMs}ms`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[reindex] FAILED:", err instanceof Error ? err.message : err);
    process.exit(2);
  });
