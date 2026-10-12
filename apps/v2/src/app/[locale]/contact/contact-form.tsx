"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleAlertIcon, CircleCheckIcon, HomeIcon, Loader2Icon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ContactFormLabels {
  subjectLabel: string;
  subjectPlaceholder: string;
  messageLabel: string;
  messagePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  submit: string;
  submitting: string;
  success: string;
  errorInvalid: string;
  errorGeneric: string;
  /** Next step shown after a successful send. */
  doneLinkLabel?: string;
}

interface Props {
  labels: ContactFormLabels;
  defaultEmail?: string;
  /** Where the post-send button leads (the dashboard for signed-in users). */
  doneHref?: string;
}

export function ContactForm({ labels, defaultEmail, doneHref }: Props) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [state, setState] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("submitting");

    let res: Response;
    try {
      res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          contact_email: email.trim(),
        }),
      });
    } catch {
      setState("idle");
      setError(labels.errorGeneric);
      return;
    }

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      setState("idle");
      setError(
        json?.error?.code === "INVALID_INPUT"
          ? labels.errorInvalid
          : labels.errorGeneric,
      );
      return;
    }

    setState("done");
  }

  if (state === "done") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 py-6 text-center"
      >
        <span
          aria-hidden
          className="inline-flex size-12 items-center justify-center rounded-md bg-success/10 text-success"
        >
          <CircleCheckIcon className="size-6" strokeWidth={1.75} />
        </span>
        <p className="text-base font-medium text-foreground">{labels.success}</p>
        {doneHref && labels.doneLinkLabel && (
          <Button asChild variant="outline" className="mt-2">
            <Link href={doneHref}>
              <HomeIcon aria-hidden />
              {labels.doneLinkLabel}
            </Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="subject">{labels.subjectLabel}</Label>
        <Input
          id="subject"
          required
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={labels.subjectPlaceholder}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">{labels.messageLabel}</Label>
        <Textarea
          id="message"
          required
          rows={8}
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={labels.messagePlaceholder}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact_email">{labels.emailLabel}</Label>
        <Input
          id="contact_email"
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={labels.emailPlaceholder}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>{error}</span>
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={state === "submitting"}
        aria-busy={state === "submitting"}
        className="w-full"
      >
        {state === "submitting" ? (
          <Loader2Icon className="animate-spin" aria-hidden />
        ) : (
          <SendIcon aria-hidden />
        )}
        {state === "submitting" ? labels.submitting : labels.submit}
      </Button>
    </form>
  );
}
