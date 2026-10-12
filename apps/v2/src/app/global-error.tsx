"use client";

// Root-level error boundary. Next.js renders this (replacing the root layout)
// when an error escapes everything below it, including the [locale] layout.
// It is also the standard hook Sentry uses to capture client-side render
// errors, so it must report to Sentry even before any locale is known.
//
// Kept deliberately minimal and locale-neutral (it stands in for the whole
// document): a short trilingual line + a reload button. Localised, friendlier
// error UI per route lives in [locale]/error.tsx (separate change).

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // Inline styles only: globals.css may not have loaded when this renders.
  // Colours mirror the brand tokens (cream, ink, slate, indigo).
  const action = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "44px",
    padding: "0 1.25rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    borderRadius: "10px",
    cursor: "pointer",
    textDecoration: "none",
    boxSizing: "border-box",
  } as const;

  return (
    <html lang="ja">
      <body
        style={{
          fontFamily:
            '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
          background: "#FBF8F2",
          color: "#1F2430",
        }}
      >
        <div
          style={{
            maxWidth: "32rem",
            width: "100%",
            textAlign: "center",
            background: "#FFFFFF",
            border: "1px solid #E7E1D5",
            borderRadius: "12px",
            padding: "2rem 1.5rem",
            boxShadow: "0 1px 2px rgba(31,36,48,0.06), 0 4px 16px rgba(31,36,48,0.06)",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, lineHeight: 1.45, margin: 0 }}>
            問題が発生しました / Something went wrong / May naganap na problema
          </h1>
          <p style={{ color: "#5B6475", fontSize: "1rem", lineHeight: 1.75, marginTop: "0.75rem" }}>
            お手数ですが、もう一度お試しください。 Please try again. Pakisubukan
            muli.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              justifyContent: "center",
              marginTop: "1.5rem",
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                ...action,
                color: "#FFFFFF",
                background: "#1E3A5F",
                border: "none",
              }}
            >
              再読み込み / Reload / I-reload
            </button>
            <Link
              href="/"
              style={{
                ...action,
                color: "#1E3A5F",
                background: "#FFFFFF",
                border: "1px solid #948D80",
              }}
            >
              ホーム / Home / Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
