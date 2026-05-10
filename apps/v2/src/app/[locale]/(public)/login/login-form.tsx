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
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const callbackUrl = new URL("/api/auth/callback", appUrl);
      callbackUrl.searchParams.set("locale", locale);
      if (redirect) callbackUrl.searchParams.set("redirect", redirect);

      const result = await supabase.auth.signInWithOAuth({
        provider: "facebook",
        options: {
          redirectTo: callbackUrl.toString(),
          // TODO: restore "email,public_profile" once the Facebook App's
          // email permission moves out of "Test ready" into Standard Access.
          // Until then, requesting email returns Invalid Scope on the new
          // Consumer App (App ID 1685408235805089).
          scopes: "public_profile",
        },
      });

      if (result.error) {
        console.error("[login] supabase signInWithOAuth error:", result.error);
        const url = new URL(window.location.href);
        url.searchParams.set("error", "fb_failed");
        window.location.replace(url.toString());
        return;
      }
      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }
      // No error and no URL — provider is misconfigured. Surface as fb_failed.
      console.error("[login] signInWithOAuth returned no redirect URL");
      const url = new URL(window.location.href);
      url.searchParams.set("error", "fb_failed");
      window.location.replace(url.toString());
    } catch (err) {
      console.error("[login] signInWithOAuth threw:", err);
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
