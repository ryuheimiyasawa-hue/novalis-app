"use client";

import { useEffect, useRef, useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mobile-only wrapper that puts the server-rendered ConversationsSidebar
// behind a hamburger trigger + left-side slide-out drawer.
//
// shadcn does not ship a Sheet component in this repo, and adding the
// shadcn CLI requires fetching external code (blocked in this env).
// A small custom drawer covers the MVP need: hamburger button, click
// to open, click-backdrop or close-button to close, Escape to close.
// Focus handling: opening moves focus to the close button, Tab / Shift+Tab
// stay inside the drawer, and closing returns focus to the hamburger.

interface Props {
  /** Label for the hamburger button (i18n'd by caller). */
  label: string;
  /** Accessible name of the close button (i18n'd by caller). */
  closeLabel?: string;
  /** The server-rendered <ConversationsSidebar /> tree. */
  children: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileSidebar({ label, closeLabel = "Close", children }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  // Escape closes the drawer; matches what users expect from any
  // overlay UI on the web.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      // Keep keyboard focus inside the open drawer.
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const current = document.activeElement;
        if (e.shiftKey && (current === first || !panel.contains(current))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (current === last || !panel.contains(current))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Move focus into the drawer when it opens and back to the hamburger
  // when it closes, so keyboard and screen-reader users keep their place.
  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    } else if (wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
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
        ref={triggerRef}
        variant="outline"
        size="icon"
        className="shrink-0 md:hidden"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-expanded={open}
      >
        <MenuIcon className="size-5" strokeWidth={1.75} aria-hidden />
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-sidebar-title"
        >
          {/* Backdrop — click to close */}
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Drawer — left slide-in, 80vw wide capped at 320px */}
          <div
            ref={panelRef}
            className="absolute inset-y-0 left-0 flex w-[85vw] max-w-[320px] flex-col bg-sidebar shadow-card pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span id="mobile-sidebar-title" className="text-base font-bold">
                {label}
              </span>
              <Button
                ref={closeRef}
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label={closeLabel}
              >
                <XIcon className="size-5" strokeWidth={1.75} aria-hidden />
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
