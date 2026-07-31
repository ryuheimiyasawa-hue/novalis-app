"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export interface MessengerLinkLabels {
  step1Title: string;
  step1Body: string;
  issueButton: string;
  issuing: string;
  reissueButton: string;
  step2Title: string;
  step2Body: string;
  openMessenger: string;
  expiresIn: string;
  expired: string;
  step3Title: string;
  step3Body: string;
  errorGeneric: string;
  errorAnon: string;
}

interface Props {
  labels: MessengerLinkLabels;
  /** m.me / Page URL. Omitted when NEXT_PUBLIC_MESSENGER_PAGE_URL is unset. */
  pageUrl?: string;
}

interface Issued {
  code: string;
  expiresAt: number; // epoch ms
  ttlMinutes: number;
}

export function MessengerLinkClient({ labels, pageUrl }: Props) {
  const [issued, setIssued] = useState<Issued | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick only while a code is live, so the expiry notice flips on its own.
  useEffect(() => {
    if (!issued) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [issued]);

  const isExpired = issued != null && now >= issued.expiresAt;

  async function issue() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/messenger/link-code", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(
          json?.error?.code === "FORBIDDEN"
            ? labels.errorAnon
            : labels.errorGeneric,
        );
        return;
      }
      setIssued({
        code: json.data.code,
        expiresAt: new Date(json.data.expires_at).getTime(),
        ttlMinutes: json.data.ttl_minutes,
      });
      setNow(Date.now());
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{labels.step1Title}</h2>
        <p className="text-sm text-muted-foreground">{labels.step1Body}</p>

        {issued && (
          <div className="rounded-md border bg-muted/30 p-6 text-center">
            <p className="font-mono text-4xl font-bold tracking-[0.3em]">
              {issued.code}
            </p>
            <p
              className={`mt-2 text-xs ${
                isExpired ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {isExpired
                ? labels.expired
                : labels.expiresIn.replace(
                    "{minutes}",
                    String(issued.ttlMinutes),
                  )}
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={issue} disabled={pending} className="w-full">
          {pending
            ? labels.issuing
            : issued
              ? labels.reissueButton
              : labels.issueButton}
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{labels.step2Title}</h2>
        <p className="text-sm text-muted-foreground">{labels.step2Body}</p>
        {pageUrl && (
          <Button asChild variant="outline" className="w-full">
            <a href={pageUrl} target="_blank" rel="noopener noreferrer">
              {labels.openMessenger}
            </a>
          </Button>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{labels.step3Title}</h2>
        <p className="text-sm text-muted-foreground">{labels.step3Body}</p>
      </section>
    </div>
  );
}
