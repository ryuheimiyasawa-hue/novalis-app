"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, HomeIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

// Back link for the public content pages (articles, restaurants). A first
// time visitor has no dashboard, so the server renders "← MORITA" to the
// landing page; once the browser finds a signed-in session it becomes the
// usual "back to dashboard" link. Display only: it reads the local session
// (no network call, no write) and never changes how sign-in works.
export function BackLink({
  locale,
  homeLabel,
  dashboardLabel,
  tone = "brand",
  className,
}: {
  locale: "ja" | "en" | "tl";
  /** Accessible name of the landing link; must contain "MORITA". */
  homeLabel: string;
  dashboardLabel: string;
  /** "brand": white text link on a blue band. "button": outlined pill. */
  tone?: "brand" | "button";
  className?: string;
}) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Not fatal either way: the landing link stays, which works for everyone.
    const skip = (err: unknown) =>
      console.warn(
        "[back-link] session check skipped:",
        err instanceof Error ? err.message : String(err),
      );
    try {
      createClient()
        .auth.getSession()
        .then(({ data }) => {
          if (!cancelled && data.session) setSignedIn(true);
        })
        .catch(skip);
    } catch (err) {
      // createClient throws synchronously when the Supabase env is absent.
      skip(err);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const look =
    tone === "brand"
      ? "inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary-foreground/90 underline-offset-4 hover:text-primary-foreground hover:underline lg:min-h-8"
      : "inline-flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-4 font-display text-sm font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-accent lg:min-h-9";

  if (signedIn) {
    return (
      <Link href={`/${locale}/dashboard`} className={cn(look, className)}>
        <HomeIcon className="size-4" strokeWidth={1.75} aria-hidden />
        {dashboardLabel}
      </Link>
    );
  }
  return (
    <Link href={`/${locale}`} aria-label={homeLabel} className={cn(look, className)}>
      <ArrowLeftIcon className="size-4" strokeWidth={2} aria-hidden />
      <span className="font-display tracking-wide">MORITA</span>
    </Link>
  );
}
