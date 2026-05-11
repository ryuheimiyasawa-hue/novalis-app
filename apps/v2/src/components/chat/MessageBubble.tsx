"use client";

import { CitationLink } from "./CitationLink";
import type { Citation } from "@/lib/ai/rag";

export type BubbleRole = "user" | "assistant" | "system";

interface Props {
  role: BubbleRole;
  content: string;
  disclaimer?: string;
  citations?: Citation[];
  locale: string;
  labels: { you: string; assistant: string; system: string; citations: string };
}

// Visually distinct bubbles per role: user right-aligned tinted,
// assistant left-aligned plain, system muted centered notice.
// Multi-line content preserves whitespace; markdown rendering can
// land later (E-7+ once needed).
export function MessageBubble({
  role,
  content,
  disclaimer,
  citations,
  locale,
  labels,
}: Props) {
  if (role === "system") {
    return (
      <div className="mx-auto max-w-[80%] rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide">
          {labels.system}
        </div>
        <p className="whitespace-pre-line">{content}</p>
      </div>
    );
  }

  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%] space-y-1">
        <div
          className={`text-xs font-medium ${isUser ? "text-right" : "text-left"} text-muted-foreground`}
        >
          {isUser ? labels.you : labels.assistant}
        </div>
        <div
          className={
            isUser
              ? "rounded-2xl rounded-tr-sm bg-primary/10 px-4 py-2.5"
              : "rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-2.5"
          }
        >
          <p className="whitespace-pre-line text-sm">{content}</p>
          {disclaimer && (
            <p className="mt-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">
              {disclaimer}
            </p>
          )}
        </div>
        {citations && citations.length > 0 && (
          <div className="space-y-1 pt-1">
            <div className="text-xs font-medium text-muted-foreground">
              {labels.citations}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {citations.map((c, i) => (
                <CitationLink
                  key={`${c.source_type}-${c.source_id}-${i}`}
                  citation={c}
                  index={i}
                  locale={locale}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
