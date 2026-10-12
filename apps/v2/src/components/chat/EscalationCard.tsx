"use client";

import { useEffect, useState } from "react";
import {
  CalendarCheckIcon,
  MailIcon,
  ScaleIcon,
  UserRoundIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Expert {
  id: string;
  name: string;
  title: string;
  specialty_ja: string | null;
  specialty_en: string | null;
  specialty_tl: string | null;
  calendar_url: string | null;
}

interface Props {
  body: string;
  locale: "ja" | "en" | "tl";
  labels: {
    heading: string;
    book: string;
    contactCta: string;
    /** "それでも質問を続ける" — only used when showContinue is true. */
    continue?: string;
    /** Persistent recommendation label kept after minimizing. */
    recommend?: string;
    /** Neutral heading for the card ("where you can consult"). */
    title?: string;
  };
  /** P2-L improvement 2: render a "continue asking" button that collapses the
   *  card. Gated by NEXT_PUBLIC_ESCALATION_SHOW_CONTINUE_BUTTON (default off). */
  showContinue?: boolean;
  /** Called when the user clicks continue, so the parent can refocus input. */
  onContinue?: () => void;
}

// Renders the escalation message + a list of active experts pulled
// from /api/experts. Public endpoint, no auth required.
//
// Layout decisions (Phase 1 polish):
//   - CardHeader (heading: "おすすめの専門家") is rendered ONLY when
//     experts.length > 0. With zero experts the heading would dangle
//     above empty content, and the body + Contact button below already
//     carry the action.
//   - Empty-state filler ("現在ご紹介できる専門家がいません") was
//     removed; the always-visible Contact button is the real action,
//     and the previous text was redundant with it.
export function EscalationCard({
  body,
  locale,
  labels,
  showContinue = false,
  onContinue,
}: Props) {
  const [experts, setExperts] = useState<Expert[] | null>(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/experts");
        if (!res.ok) {
          if (!cancelled) setExperts([]);
          return;
        }
        const json = await res.json();
        if (!cancelled) setExperts(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (!cancelled) setExperts([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function pickSpecialty(e: Expert): string {
    if (locale === "en") return e.specialty_en ?? e.specialty_ja ?? "";
    if (locale === "tl") return e.specialty_tl ?? e.specialty_ja ?? "";
    return e.specialty_ja ?? "";
  }

  const hasExperts = Array.isArray(experts) && experts.length > 0;

  // Minimized state (after the user chose to keep asking): collapse to a
  // single persistent recommendation line so the conversation visibly
  // continues without losing the "consult an expert" reminder.
  if (minimized) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-border border-l-[3px] border-l-caution bg-card px-4 py-3">
        <ScaleIcon className="size-4 shrink-0 text-caution" strokeWidth={1.75} aria-hidden />
        <p className="text-sm text-muted-foreground">
          {labels.recommend ?? labels.heading}
        </p>
      </div>
    );
  }

  // A careful hand-off, not an error: terracotta accent, a scales icon,
  // the lawyer-reviewed body text verbatim, then the places to consult.
  return (
    <section
      aria-label={labels.title ?? labels.heading}
      className="overflow-hidden rounded-lg border border-border border-t-[3px] border-t-caution bg-card shadow-card"
    >
      <div className="space-y-4 p-5 md:p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-highlight-soft text-caution"
          >
            <ScaleIcon className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 space-y-1">
            {labels.title && (
              <h2 className="text-base font-bold text-caution-foreground">{labels.title}</h2>
            )}
            <p className="text-base whitespace-pre-line text-foreground">{body}</p>
          </div>
        </div>

        {experts === null && (
          <div className="space-y-2" aria-busy="true">
            <div className="h-14 animate-pulse rounded-md bg-muted" />
            <div className="h-14 animate-pulse rounded-md bg-muted" />
          </div>
        )}

        {hasExperts && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold">{labels.heading}</h3>
            <ul className="space-y-2">
              {experts!.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-3 rounded-md border border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-primary-soft text-primary"
                    >
                      <UserRoundIcon className="size-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-base font-bold">
                        {e.name}{" "}
                        <span className="text-sm font-normal text-muted-foreground">{e.title}</span>
                      </p>
                      {pickSpecialty(e) && (
                        <p className="text-sm text-muted-foreground">
                          {pickSpecialty(e)}
                        </p>
                      )}
                    </div>
                  </div>
                  {e.calendar_url && (
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <a
                        href={e.calendar_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <CalendarCheckIcon aria-hidden />
                        {labels.book}
                      </a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/*
          Standing fallback: even when an expert is shown, the user may
          prefer to write to Novalis support directly. New tab so they
          don't lose the chat context behind them.
        */}
        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap">
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="h-auto min-h-11 justify-start py-2 text-left whitespace-normal md:min-h-9"
          >
            <a
              href={`/${locale}/contact`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MailIcon aria-hidden />
              {labels.contactCta}
            </a>
          </Button>
          {showContinue && labels.continue && (
            <Button
              size="sm"
              variant="ghost"
              className="h-auto min-h-11 justify-start py-2 text-left whitespace-normal md:min-h-9"
              onClick={() => {
                setMinimized(true);
                onContinue?.();
              }}
            >
              {labels.continue}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
