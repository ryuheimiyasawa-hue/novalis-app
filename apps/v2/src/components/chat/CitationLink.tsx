import Link from "next/link";
import type { Citation } from "@/lib/ai/rag";

interface Props {
  citation: Citation;
  index: number;
  locale: string;
}

// Compact citation chip rendered inside MessageBubble. Articles
// link to the public detail page; FAQs have no slug so they show
// the question + snippet inline only.
export function CitationLink({ citation, index, locale }: Props) {
  const label = `[${index + 1}]`;
  const inner = (
    <span className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-sm transition-colors hover:border-primary/40 hover:bg-accent">
      <span className="font-mono text-xs text-primary">{label}</span>
      <span className="min-w-0 text-left break-words text-foreground">{citation.title}</span>
    </span>
  );
  if (citation.source_type === "article" && citation.slug) {
    // Open in a new tab so the in-progress chat conversation
    // (held in ChatShell useState) is not unmounted when the
    // user follows a citation. Phase 2 will add server-side
    // conversation restore; until then, target=_blank is the
    // minimal fix for the demo path.
    return (
      <Link
        href={`/${locale}/articles/${citation.slug}`}
        className="no-underline"
        title={citation.snippet}
        target="_blank"
        rel="noopener noreferrer"
      >
        {inner}
      </Link>
    );
  }
  return <span title={citation.snippet}>{inner}</span>;
}
