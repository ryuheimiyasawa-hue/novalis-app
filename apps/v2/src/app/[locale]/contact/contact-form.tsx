"use client";

import { useState } from "react";
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
}

interface Props {
  labels: ContactFormLabels;
  defaultEmail?: string;
}

export function ContactForm({ labels, defaultEmail }: Props) {
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
      <div className="rounded-md border border-green-600/40 bg-green-50 p-6 text-center text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">
        {labels.success}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
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
      <div className="space-y-1.5">
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
      <div className="space-y-1.5">
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={state === "submitting"} className="w-full">
        {state === "submitting" ? labels.submitting : labels.submit}
      </Button>
    </form>
  );
}
