"use client";

import { useEffect } from "react";

// Root layout hard-codes <html lang="ja"> because Next.js 16 requires the
// <html> tag in the root and root layout cannot read [locale] params.
// This client component patches document.documentElement.lang on locale
// transitions so accessibility tools and browser language hints stay in sync.
export function LangSync({ locale }: { locale: string }) {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);
  return null;
}
