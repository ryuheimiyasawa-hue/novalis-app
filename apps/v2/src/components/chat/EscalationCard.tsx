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
  labels: { heading: string; book: string; none: string; contactCta: string };
}

// Renders the escalation message + a list of active experts pulled
// from /api/experts. Public endpoint, no auth required.
export function EscalationCard({ body, locale, labels }: Props) {
  const [experts, setExperts] = useState<Expert[] | null>(null);

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

  return (
    <Card className="border-amber-300 bg-amber-50/40">
      <CardHeader>
        <CardTitle className="text-base">{labels.heading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-line text-sm">{body}</p>
        {experts === null ? (
          <p className="text-xs text-muted-foreground">…</p>
        ) : experts.length === 0 ? (
          <p className="text-xs text-muted-foreground">{labels.none}</p>
        ) : (
          <ul className="space-y-2">
            {experts.map((e) => (
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
        <div className="pt-1">
          <Button asChild size="sm" variant="secondary">
            <a
              href={`/${locale}/contact`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {labels.contactCta}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
