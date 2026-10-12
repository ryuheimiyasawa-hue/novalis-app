"use client";

import { CircleAlertIcon, ExternalLinkIcon } from "lucide-react";
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

  const stepClass =
    "space-y-3 rounded-lg border border-border border-l-[3px] border-l-highlight bg-card p-5 shadow-card md:p-6";

  return (
    <ol className="space-y-4">
      <li className={stepClass}>
        <h2 className="text-xl font-bold">{labels.step1Title}</h2>
        <p className="text-base text-muted-foreground">{labels.step1Body}</p>

        {issued && (
          <div className="rounded-md bg-primary-soft p-6 text-center" aria-live="polite">
            <p className="font-mono text-4xl font-bold tracking-[0.3em] text-primary">
              {issued.code}
            </p>
            <p
              className={`mt-2 text-sm ${
                isExpired ? "font-medium text-destructive" : "text-muted-foreground"
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

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
          >
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>{error}</span>
          </p>
        )}

        <Button onClick={issue} disabled={pending} aria-busy={pending} size="lg" className="w-full">
          {pending
            ? labels.issuing
            : issued
              ? labels.reissueButton
              : labels.issueButton}
        </Button>
      </li>

      <li className={stepClass}>
        <h2 className="text-xl font-bold">{labels.step2Title}</h2>
        <p className="text-base text-muted-foreground">{labels.step2Body}</p>
        {pageUrl && (
          <Button asChild variant="outline" size="lg" className="w-full">
            <a href={pageUrl} target="_blank" rel="noopener noreferrer">
              {labels.openMessenger}
              <ExternalLinkIcon aria-hidden />
            </a>
          </Button>
        )}
      </li>

      <li className={stepClass}>
        <h2 className="text-xl font-bold">{labels.step3Title}</h2>
        <p className="text-base text-muted-foreground">{labels.step3Body}</p>
      </li>
    </ol>
  );
}
