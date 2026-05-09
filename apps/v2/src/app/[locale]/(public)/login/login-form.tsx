"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  locale: string;
  redirect: string | null;
  buttonLabel: string;
}

export function LoginForm({ locale, redirect, buttonLabel }: Props) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const supabase = createClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const callbackUrl = new URL("/api/auth/callback", appUrl);
      callbackUrl.searchParams.set("locale", locale);
      if (redirect) callbackUrl.searchParams.set("redirect", redirect);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "facebook",
        options: {
          redirectTo: callbackUrl.toString(),
          scopes: "email,public_profile",
        },
      });

      if (error) {
        // signInWithOAuth normally redirects on success; only here on local
        // failure (network etc). Redirect back with error param so the
        // server-rendered banner picks it up.
        const url = new URL(window.location.href);
        url.searchParams.set("error", "fb_failed");
        window.location.replace(url.toString());
      }
    } catch {
      const url = new URL(window.location.href);
      url.searchParams.set("error", "fb_failed");
      window.location.replace(url.toString());
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="w-full px-6 py-3 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
    >
      {buttonLabel}
    </button>
  );
}
