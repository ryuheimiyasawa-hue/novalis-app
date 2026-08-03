"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { consumeChatStream, type ChatStreamEvent } from "@/lib/chat/sse-client";
import {
  isTerminalPollStatus,
  nextPollDelayMs,
  type PollMode,
} from "@/lib/chat/poll-interval";
import type { Citation } from "@/lib/ai/rag";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { MessageBubble, type BubbleRole } from "./MessageBubble";
import { EscalationCard } from "./EscalationCard";
import { shouldShowEscalationCard } from "@/lib/chat/escalation-display";

// P2-L improvement 2 flag. NEXT_PUBLIC_ is inlined at build, so the client
// can read it directly. Default off → Phase 1 behaviour (card always shown,
// no continue button, no cooldown).
const CONTINUE_ENABLED =
  process.env.NEXT_PUBLIC_ESCALATION_SHOW_CONTINUE_BUTTON === "true";

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
    escalationContinue: string;
    escalationRecommend: string;
    citationsHeading: string;
    backToDashboard: string;
    languageLabel: string;
    youLabel: string;
    assistantLabel: string;
    systemLabel: string;
    operatorLabel: string;
    operatorBanner: string;
    pollError: string;
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
  // P2-B2. `mode` mirrors conversations.mode: while it is "operator" the
  // AI is muted and replies arrive by polling instead of SSE.
  const [mode, setMode] = useState<PollMode>("auto");
  const [pollStopped, setPollStopped] = useState(false);
  const modeRef = useRef<PollMode>("auto");
  // Only messages created after this instant can be new to us: the
  // server already rendered everything up to mount into initialMessages.
  const cursorRef = useRef<string>(new Date().toISOString());
  const seenIdsRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Cooldown bookkeeping for escalation improvement 2: count user turns and
  // remember the turn at which the last full EscalationCard was shown.
  const userTurnsRef = useRef(0);
  const lastCardTurnRef = useRef<number | null>(null);

  // Auto-scroll on new content.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  // P2-B2 polling loop. Runs only while a conversation exists, pauses
  // when the tab is hidden, and backs off then gives up on repeated
  // failures rather than retrying forever (see poll-interval.ts).
  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    function schedule() {
      if (cancelled) return;
      const delay = nextPollDelayMs({
        mode: modeRef.current,
        consecutiveFailures: failures,
      });
      if (delay === null) {
        setPollStopped(true);
        return;
      }
      timer = setTimeout(() => void tick(), delay);
    }

    async function tick() {
      if (cancelled) return;
      // Nobody is looking; skip the request but keep the loop alive so
      // it resumes the moment the tab comes back.
      if (typeof document !== "undefined" && document.hidden) {
        schedule();
        return;
      }

      try {
        const res = await fetch(
          `/api/chat/conversations/${conversationId}/updates?after=${encodeURIComponent(cursorRef.current)}`,
          { headers: { accept: "application/json" } },
        );

        // 401/403/404 cannot be fixed by retrying — stop and say so.
        if (isTerminalPollStatus(res.status)) {
          if (!cancelled) setPollStopped(true);
          return;
        }
        if (!res.ok) throw new Error(`poll ${res.status}`);

        const payload = (await res.json()) as {
          ok: boolean;
          data?: {
            mode: PollMode;
            messages: Array<{
              id: string;
              role: string;
              content: string;
              created_at: string;
            }>;
          };
        };
        if (!payload.ok || !payload.data) throw new Error("poll payload");
        if (cancelled) return;

        failures = 0;
        modeRef.current = payload.data.mode;
        setMode(payload.data.mode);

        const rows = payload.data.messages;
        if (rows.length > 0) {
          // Advance the cursor past everything we were handed, whatever
          // its role, so the next poll stays a narrow index range scan.
          cursorRef.current = rows[rows.length - 1]!.created_at;

          // Render operator turns only. Assistant replies already
          // arrived over SSE and the user's own messages were appended
          // optimistically; re-adding either would double them up.
          const fresh = rows.filter(
            (r) => r.role === "operator" && !seenIdsRef.current.has(r.id),
          );
          if (fresh.length > 0) {
            for (const r of fresh) seenIdsRef.current.add(r.id);
            setMessages((prev) => [
              ...prev,
              ...fresh.map((r) => ({
                id: `srv-${r.id}`,
                role: "operator" as BubbleRole,
                content: r.content,
              })),
            ]);
          }
        }
      } catch {
        failures += 1;
      }
      schedule();
    }

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [conversationId]);

  function resetConversation() {
    setMessages([]);
    setConversationId(null);
    setStreamingText("");
    setIsStreaming(false);
    setMode("auto");
    setPollStopped(false);
    modeRef.current = "auto";
    cursorRef.current = new Date().toISOString();
    seenIdsRef.current.clear();
    userTurnsRef.current = 0;
    lastCardTurnRef.current = null;
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

    userTurnsRef.current += 1;
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
    let operatorPendingText: string | null = null;
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
            } else if (e.kind === "operator_pending") {
              // Staff hold this thread. Learn the mode immediately so the
              // banner appears and polling tightens without waiting for
              // the next auto-interval poll.
              operatorPendingText = e.text;
              modeRef.current = "operator";
              setMode("operator");
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
        // Cooldown: within the window after a full card, render the
        // escalation as a compact system note instead of re-showing the card.
        const turnsSince =
          lastCardTurnRef.current === null
            ? null
            : userTurnsRef.current - lastCardTurnRef.current;
        const showCard = shouldShowEscalationCard({
          cooldownEnabled: CONTINUE_ENABLED,
          turnsSinceLastCard: turnsSince,
        });
        if (showCard) {
          lastCardTurnRef.current = userTurnsRef.current;
          next.push({
            id: nextId(),
            role: "system",
            content: "",
            escalation: { text: escalationText },
          });
        } else {
          next.push({ id: nextId(), role: "system", content: escalationText });
        }
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
      } else if (operatorPendingText !== null) {
        next.push({
          id: nextId(),
          role: "system",
          content: operatorPendingText,
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
    operator: labels.operatorLabel,
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

      {mode === "operator" && (
        <p
          role="status"
          className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-700 dark:text-blue-300"
        >
          {labels.operatorBanner}
        </p>
      )}
      {pollStopped && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          {labels.pollError}
        </p>
      )}

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
                continue: labels.escalationContinue,
                recommend: labels.escalationRecommend,
              }}
              showContinue={CONTINUE_ENABLED}
              onContinue={() => inputRef.current?.focus()}
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
