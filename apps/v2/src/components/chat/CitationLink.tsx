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
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 text-xs hover:bg-muted">
      <span className="font-mono text-muted-foreground">{label}</span>
      <span className="text-foreground/80">{citation.title}</span>
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
