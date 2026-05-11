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
    return (
      <Link
        href={`/${locale}/articles/${citation.slug}`}
        className="no-underline"
        title={citation.snippet}
      >
        {inner}
      </Link>
    );
  }
  return <span title={citation.snippet}>{inner}</span>;
}
