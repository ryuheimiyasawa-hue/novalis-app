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

  return (
    <html lang="ja">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
            問題が発生しました / Something went wrong / May naganap na problema
          </h1>
          <p style={{ color: "#666", fontSize: "0.875rem", marginTop: "0.5rem" }}>
            お手数ですが、もう一度お試しください。 Please try again. Pakisubukan
            muli.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: "1.25rem",
              padding: "0.6rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#fff",
              background: "#171717",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            再読み込み / Reload / I-reload
          </button>
        </div>
      </body>
    </html>
  );
}
