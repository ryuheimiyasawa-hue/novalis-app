import { promises as fs } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  getLegalDocumentPath,
} from "@/lib/legal/versions";

const LOCALES = ["ja", "en", "tl"] as const;
const LEGAL_DIR = path.join(process.cwd(), "public", "legal");

// The lawyer-revised documents are written to disk and guarded here, but
// they are NOT live yet: CURRENT_*_VERSION still points at 1.0.0. Flipping
// the constants publishes a privacy policy whose Article 5 says the user
// consented to cross-border transfer at registration, which is only true
// once the re-consent gate ships. Bump the constants and this line
// together, never separately.
const PENDING_VERSION = "1.1.0";

function read(type: "terms" | "privacy", version: string, locale: string) {
  return fs.readFile(path.join(LEGAL_DIR, `${type}-${version}-${locale}.md`), "utf8");
}

// The consent flow records which version the user agreed to, and the
// legal pages resolve their file straight from these constants. A
// version bump with a locale missing on disk would 500 the page for
// exactly the users least able to work around it.
describe("legal documents ship for every locale at the current version", () => {
  it.each(LOCALES)("terms exists for %s", async (locale) => {
    await expect(read("terms", CURRENT_TERMS_VERSION, locale)).resolves.toMatch(/.+/);
  });

  it.each(LOCALES)("privacy exists for %s", async (locale) => {
    await expect(read("privacy", CURRENT_PRIVACY_VERSION, locale)).resolves.toMatch(/.+/);
  });

  it.each(LOCALES)("the staged %s documents are complete too", async (locale) => {
    await expect(read("terms", PENDING_VERSION, locale)).resolves.toMatch(/.+/);
    await expect(read("privacy", PENDING_VERSION, locale)).resolves.toMatch(/.+/);
  });

  it("getLegalDocumentPath points at a file that is actually on disk", async () => {
    const rel = getLegalDocumentPath("privacy", CURRENT_PRIVACY_VERSION, "ja");
    await expect(fs.readFile(path.join(process.cwd(), "public", rel), "utf8")).resolves.toMatch(/.+/);
  });
});

// 2026-08-10 lawyer review §2-3: privacy policy Article 5 now has to
// disclose every cross-border recipient, its country, what is sent, and
// why. The list is the substance of the consent users give at
// registration, so a translation that quietly drops a recipient would
// make that consent incomplete.
describe("privacy policy discloses the cross-border transfers", () => {
  const RECIPIENTS = ["Google LLC", "Supabase, Inc.", "Vercel Inc.", "Meta Platforms, Inc.", "Functional Software, Inc."];

  it.each(LOCALES)("lists all five recipients in %s", async (locale) => {
    const body = await read("privacy", PENDING_VERSION, locale);
    for (const r of RECIPIENTS) expect(body).toContain(r);
  });

  it.each(LOCALES)("links the PPC reference on foreign regimes in %s", async (locale) => {
    const body = await read("privacy", PENDING_VERSION, locale);
    expect(body).toContain("https://www.ppc.go.jp/personalinfo/legal/kaiseihogohou/");
  });
});

// The recipient list is authored as a GFM table. react-markdown does not
// parse tables unless remark-gfm is passed, and the failure is silent:
// the page renders a wall of pipe characters instead of erroring. These
// two tests pin both halves — that the markdown really does produce a
// table, and that the pages actually enable the plugin.
describe("the Article 5 table renders as a table", () => {
  it.each(LOCALES)("produces <table> markup for %s", async (locale) => {
    const body = await read("privacy", PENDING_VERSION, locale);
    const html = renderToStaticMarkup(
      createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], skipHtml: true }, body),
    );
    expect(html).toContain("<table>");
    expect((html.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(6); // header + 5 recipients
    expect(html).not.toContain("| ---");
  });

  it.each(["terms", "privacy"] as const)("the %s page passes remarkGfm to ReactMarkdown", async (page) => {
    const src = await fs.readFile(
      path.join(process.cwd(), "src", "app", "[locale]", "legal", page, "page.tsx"),
      "utf8",
    );
    expect(src).toContain("remarkPlugins={[remarkGfm]}");
  });
});

// The lawyer's returned docx kept leftovers from the old template next to
// the clauses that replaced them: a "change without notice" paragraph
// beside the Civil Code 548-4 notice duty, "exclusive" beside the
// additional-jurisdiction rewrite. Either leftover would undercut the
// notice we owe users before 1.1.0 takes effect. Checks are scoped to
// the article, because suspending the service (terms Art. 6/10) may
// legitimately happen without notice.
function article(body: string, n: number) {
  const heading = new RegExp(`^## (第${n}条|Article ${n}\\.|Artikulo ${n}\\.)`, "m");
  const start = body.search(heading);
  if (start < 0) throw new Error(`article ${n} not found`);
  const rest = body.slice(start + 3);
  const end = rest.search(/^(## |---)/m);
  return end < 0 ? rest : rest.slice(0, end);
}

describe(`${PENDING_VERSION} carries no template leftovers that contradict the revision`, () => {
  const leftovers = [
    { type: "terms", n: 11, ja: "通知することなく", en: "without notice", tl: "walang abiso" },
    { type: "terms", n: 15, ja: "専属的", en: "exclusive", tl: "eksklusibo" },
    { type: "privacy", n: 11, ja: "通知することなく", en: "without notifying", tl: "hindi naaabisuhan" },
    { type: "privacy", n: 11, ja: "掲載した時点から効力", en: "posted on this site", tl: "i-post sa site na ito" },
  ] as const;

  for (const l of leftovers) {
    it.each(LOCALES)(`${l.type} article ${l.n} %s has no "${l.en}"`, async (locale) => {
      const body = await read(l.type, PENDING_VERSION, locale);
      expect(article(body, l.n)).not.toContain(l[locale]);
    });
  }
});
