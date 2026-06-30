"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className="border-amber-300 bg-amber-50/40">
        <CardContent className="py-3">
          <p className="text-xs text-muted-foreground">
            {labels.recommend ?? labels.heading}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-300 bg-amber-50/40">
      {hasExperts && (
        <CardHeader>
          <CardTitle className="text-base">{labels.heading}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-3 pt-6">
        <p className="whitespace-pre-line text-sm">{body}</p>
        {experts === null && (
          <p className="text-xs text-muted-foreground">…</p>
        )}
        {hasExperts && (
          <ul className="space-y-2">
            {experts!.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded border border-border bg-background px-3 py-2"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {e.name}{" "}
                    <span className="text-xs text-muted-foreground">{e.title}</span>
                  </p>
                  {pickSpecialty(e) && (
                    <p className="text-xs text-muted-foreground">
                      {pickSpecialty(e)}
                    </p>
                  )}
                </div>
                {e.calendar_url && (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={e.calendar_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {labels.book}
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {/*
          Standing fallback: even when an expert is shown, the user may
          prefer to write to Novalis support directly. New tab so they
          don't lose the chat context behind them.
        */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" variant="secondary">
            <a
              href={`/${locale}/contact`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {labels.contactCta}
            </a>
          </Button>
          {showContinue && labels.continue && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setMinimized(true);
                onContinue?.();
              }}
            >
              {labels.continue}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
