"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { consumeChatStream, type ChatStreamEvent } from "@/lib/chat/sse-client";
import type { Citation } from "@/lib/ai/rag";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { MessageBubble, type BubbleRole } from "./MessageBubble";
import { EscalationCard } from "./EscalationCard";

interface Props {
  locale: "ja" | "en" | "tl";
  /** When the user follows a `/chat?conversation_id=...` link from
   *  the past-conversations page, the chat page resolves the row
   *  server-side and passes the prior messages here so the shell
   *  hydrates with them on mount. Omit for a fresh conversation. */
  initialConversationId?: string;
  initialMessages?: UiMessage[];
  labels: {
    title: string;
    subtitle: string;
    newConversation: string;
    inputPlaceholder: string;
    send: string;
    thinking: string;
    errorRetry: string;
    errorGeneric: string;
    errorQuota: string;
    errorAuth: string;
    expertHeading: string;
    expertSchedule: string;
    contactCta: string;
    citationsHeading: string;
    backToDashboard: string;
    languageLabel: string;
    youLabel: string;
    assistantLabel: string;
    systemLabel: string;
  };
}

interface UiMessage {
  id: string; // local id for React key
  role: BubbleRole;
  content: string;
  disclaimer?: string;
  citations?: Citation[];
  escalation?: { text: string };
}

let localIdCounter = 0;
const nextId = () => `local-${++localIdCounter}-${Date.now()}`;

export function ChatShell({
  locale,
  initialConversationId,
  initialMessages,
  labels,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<UiMessage[]>(
    () => initialMessages ?? [],
  );
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new content.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  function resetConversation() {
    setMessages([]);
    setConversationId(null);
    setStreamingText("");
    setIsStreaming(false);
    // Strip the ?conversation_id=... query so a reload doesn't put us
    // back into the now-cleared conversation. router.replace keeps the
    // navigation out of history.
    router.replace(`/${locale}/chat`);
    inputRef.current?.focus();
  }

  async function send() {
    const message = input.trim();
    if (!message || isStreaming) return;

    // Capture the conversation state at the moment of send: when this
    // is the first message of a fresh thread (no conversationId yet),
    // we need to refresh the parent server tree after the stream ends
    // so the new row appears in the past-conversations sidebar.
    const wasNewConversation = conversationId === null;

    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: message },
    ]);
    setInput("");
    setIsStreaming(true);
    setStreamingText("");

    let accumulated = "";
    let finalCitations: Citation[] = [];
    let finalDisclaimer = "";
    let finalText = "";
    let escalationText: string | null = null;
    let smalltalkText: string | null = null;
    let blockedText: string | null = null;
    let errored = false;

    await consumeChatStream(
      {
        message,
        locale,
        ...(conversationId ? { conversationId } : {}),
      },
      {
        onEvent: (e: ChatStreamEvent) => {
          if (e.type === "meta") {
            if (!conversationId) setConversationId(e.conversationId);
          } else if (e.type === "token") {
            accumulated += e.text;
            setStreamingText(accumulated);
          } else if (e.type === "done") {
            if (e.kind === "answer") {
              finalCitations = e.citations;
              finalDisclaimer = e.disclaimer;
              // Replace streamed text with PII-masked final text.
              finalText = e.text;
            } else if (e.kind === "escalate") {
              escalationText = e.text;
            } else if (e.kind === "smalltalk") {
              smalltalkText = e.text;
            } else if (e.kind === "blocked") {
              blockedText = e.text;
            } else if (e.kind === "error") {
              errored = true;
            }
          }
        },
        onHttpError: (status, payload) => {
          errored = true;
          if (status === 401) {
            toast.error(labels.errorAuth);
          } else if (status === 429) {
            toast.error(labels.errorQuota);
          } else {
            const code =
              (payload as { error?: { code?: string } } | null)?.error?.code ??
              "INTERNAL_ERROR";
            toast.error(`${labels.errorGeneric} (${code})`);
          }
        },
      },
    );

    // Commit the final state into messages array.
    setMessages((prev) => {
      const next = [...prev];
      if (finalText) {
        next.push({
          id: nextId(),
          role: "assistant",
          content: finalText,
          disclaimer: finalDisclaimer,
          citations: finalCitations,
        });
      } else if (escalationText !== null) {
        next.push({
          id: nextId(),
          role: "system",
          content: "",
          escalation: { text: escalationText },
        });
      } else if (smalltalkText !== null) {
        // Render smalltalk as a normal assistant bubble — no
        // disclaimer, no citations, no escalation card. The canned
        // text already explains the service's scope.
        next.push({
          id: nextId(),
          role: "assistant",
          content: smalltalkText,
        });
      } else if (blockedText !== null) {
        next.push({
          id: nextId(),
          role: "system",
          content: blockedText,
        });
      } else if (errored) {
        next.push({
          id: nextId(),
          role: "system",
          content: labels.errorGeneric,
        });
      }
      return next;
    });
    setStreamingText("");
    setIsStreaming(false);

    // Sidebar refresh: only when we just started a brand-new thread.
    // Subsequent turns within the same conversation do not need a
    // server-tree refresh — the sidebar already shows this row, and
    // its updated_at only changes if the user re-opens the thread.
    if (wasNewConversation) {
      router.refresh();
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter to send; Shift+Enter for newline; IME composing ignored.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  const bubbleLabels = {
    you: labels.youLabel,
    assistant: labels.assistantLabel,
    system: labels.systemLabel,
    citations: labels.citationsHeading,
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-3 p-4">
      {/* Header — title + subtitle only on desktop; the mobile chat
          page renders its own header with the hamburger trigger. */}
      <header className="hidden items-end justify-between gap-3 border-b border-border pb-3 md:flex">
        <div>
          <h1 className="text-xl font-bold">{labels.title}</h1>
          <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <LocaleSwitcher
            currentLocale={locale}
            label={labels.languageLabel}
          />
          <Button asChild variant="ghost" size="sm">
            <Link href={`/${locale}/dashboard`}>
              <HomeIcon className="size-4" aria-hidden />
              {labels.backToDashboard}
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={resetConversation}>
            {labels.newConversation}
          </Button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-1 py-2"
      >
        {messages.map((m) =>
          m.escalation ? (
            <EscalationCard
              key={m.id}
              body={m.escalation.text}
              locale={locale}
              labels={{
                heading: labels.expertHeading,
                book: labels.expertSchedule,
                contactCta: labels.contactCta,
              }}
            />
          ) : (
            <MessageBubble
              key={m.id}
              role={m.role}
              content={m.content}
              disclaimer={m.disclaimer}
              citations={m.citations}
              locale={locale}
              labels={bubbleLabels}
            />
          ),
        )}
        {isStreaming && streamingText && (
          <MessageBubble
            role="assistant"
            content={streamingText + "▍"}
            locale={locale}
            labels={bubbleLabels}
          />
        )}
        {isStreaming && !streamingText && (
          <p className="text-xs text-muted-foreground">{labels.thinking}</p>
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-border pt-3">
        <Textarea
          ref={inputRef}
          rows={2}
          value={input}
          disabled={isStreaming}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder={labels.inputPlaceholder}
          className="flex-1 resize-none"
        />
        <Button
          onClick={send}
          disabled={isStreaming || !input.trim()}
          className="shrink-0"
        >
          {labels.send}
        </Button>
      </div>
    </div>
  );
}
