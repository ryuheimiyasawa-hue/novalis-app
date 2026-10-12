"use client";

import { BotIcon, HeadsetIcon, InfoIcon } from "lucide-react";
import { CitationLink } from "./CitationLink";
import type { Citation } from "@/lib/ai/rag";

export type BubbleRole = "user" | "assistant" | "system" | "operator";

interface Props {
  role: BubbleRole;
  content: string;
  disclaimer?: string;
  citations?: Citation[];
  locale: string;
  labels: {
    you: string;
    assistant: string;
    system: string;
    operator: string;
    citations: string;
  };
}

// Visually distinct bubbles per role: user right-aligned tinted,
// assistant left-aligned plain, system muted centered notice,
// operator left-aligned but accented so a human reply is never mistaken
// for the AI (P2-B2 — the previous code silently rendered operator rows
// as `assistant`, which is exactly the confusion to avoid).
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
    // Block notices (personal data, too long), send errors and hand-off
    // notes all arrive as system rows: one calm, clearly marked notice.
    return (
      <div className="mx-auto flex max-w-[92%] items-start gap-3 rounded-lg border border-highlight/40 bg-highlight-soft px-4 py-3 text-sm text-foreground md:max-w-[80%]">
        <InfoIcon
          className="mt-0.5 size-4 shrink-0 text-highlight-soft-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="min-w-0">
          <div className="mb-0.5 text-xs font-bold text-highlight-soft-foreground">
            {labels.system}
          </div>
          <p className="whitespace-pre-line">{content}</p>
        </div>
      </div>
    );
  }

  const isUser = role === "user";
  const isOperator = role === "operator";
  const senderLabel = isUser
    ? labels.you
    : isOperator
      ? labels.operator
      : labels.assistant;
  const bubbleClass = isUser
    ? "rounded-lg rounded-tr-[4px] bg-primary px-4 py-3 text-primary-foreground"
    : isOperator
      ? "rounded-lg rounded-tl-[4px] border border-primary/30 bg-primary-soft px-4 py-3"
      : "rounded-lg rounded-tl-[4px] border border-border bg-card px-4 py-3 shadow-card";
  const AvatarIcon = isOperator ? HeadsetIcon : BotIcon;

  return (
    <div className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <span
          aria-hidden
          className={`mt-6 inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] ${
            isOperator ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary"
          }`}
        >
          <AvatarIcon className="size-4" strokeWidth={1.75} />
        </span>
      )}
      <div className={`min-w-0 space-y-1 ${isUser ? "max-w-[85%] md:max-w-[75%]" : "max-w-[88%] md:max-w-[80%]"}`}>
        <div
          className={`text-xs font-medium ${isUser ? "text-right" : "text-left"} ${isOperator ? "text-primary" : "text-muted-foreground"}`}
        >
          {senderLabel}
        </div>
        <div className={bubbleClass}>
          <p className="text-base break-words whitespace-pre-line">{content}</p>
          {disclaimer && (
            <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
              <InfoIcon className="mt-1 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span>{disclaimer}</span>
            </p>
          )}
        </div>
        {citations && citations.length > 0 && (
          <div className="space-y-1.5 pt-1">
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
