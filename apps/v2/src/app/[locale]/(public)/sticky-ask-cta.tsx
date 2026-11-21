"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessagesSquareIcon } from "lucide-react";

// Phone-only "Ask MORITA AI" pill pinned to the bottom of the landing page.
// It appears only once the hero's own call to action has scrolled out of
// view, so the first screen never shows two of the same button. One fixed
// element, no hover dependence: safe in the Facebook in-app browser.
export function StickyAskCta({
  href,
  label,
  watchId,
}: {
  href: string;
  label: string;
  /** id of the hero CTA whose visibility decides whether this shows. */
  watchId: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(watchId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchId]);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-card transition-transform duration-200 md:hidden ${
        visible ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
    >
      <Link
        href={href}
        tabIndex={visible ? undefined : -1}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-highlight font-display text-base font-extrabold text-highlight-foreground shadow-card hover:bg-highlight-hover"
      >
        <MessagesSquareIcon className="size-5" strokeWidth={2} aria-hidden />
        {label}
      </Link>
    </div>
  );
}
