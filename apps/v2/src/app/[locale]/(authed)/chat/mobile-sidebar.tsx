"use client";

import { useEffect, useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mobile-only wrapper that puts the server-rendered ConversationsSidebar
// behind a hamburger trigger + left-side slide-out drawer.
//
// shadcn does not ship a Sheet component in this repo, and adding the
// shadcn CLI requires fetching external code (blocked in this env).
// A small custom drawer covers the MVP need: hamburger button, click
// to open, click-backdrop or close-button to close, Escape to close.
// Focus trap is deliberately skipped — Phase 2 can swap in Radix
// Dialog if mobile a11y review demands it.

interface Props {
  /** Label for the hamburger button (i18n'd by caller). */
  label: string;
  /** The server-rendered <ConversationsSidebar /> tree. */
  children: React.ReactNode;
}

export function MobileSidebar({ label, children }: Props) {
  const [open, setOpen] = useState(false);

  // Escape closes the drawer; matches what users expect from any
  // overlay UI on the web.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Prevent body scroll while drawer is open (otherwise the page
  // behind it scrolls when the user swipes inside the drawer).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-expanded={open}
      >
        <MenuIcon className="size-5" aria-hidden />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          {/* Backdrop — click to close */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Drawer — left slide-in, 80vw wide capped at 320px */}
          <div className="absolute inset-y-0 left-0 flex w-[80vw] max-w-[320px] flex-col bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold">{label}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <XIcon className="size-5" aria-hidden />
              </Button>
            </div>
            {/* The server-rendered sidebar is inserted as children so
                the same component renders identically in desktop and
                mobile contexts. onClick anywhere inside that bubbles
                via a Link will dismiss the drawer for free because the
                navigation will unmount this whole subtree. */}
            <div
              className="flex-1 overflow-hidden"
              onClick={(e) => {
                // Close when the user clicks an anchor (any conversation
                // row or the "新しい相談" link). Other clicks (whitespace,
                // empty state) keep the drawer open.
                const target = e.target as HTMLElement;
                if (target.closest("a")) setOpen(false);
              }}
            >
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
