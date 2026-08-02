"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Sign-out affordance. The app previously had none, which stranded anyone who
// started an anonymous "try without signing in" session: every authed page
// accepted the anon session, so there was no way back to a real login without
// clearing cookies by hand.
//
// signOut() clears the session client-side; router.refresh() then makes the
// server components re-evaluate with no cookie, and the proxy sends the user
// to /login.

interface Props {
  locale: string;
  label: string;
  pendingLabel: string;
}

export function SignOutButton({ locale, label, pendingLabel }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await createClient().auth.signOut();
    } catch {
      // Even if the network call fails the local session is dropped; fall
      // through to the redirect rather than trapping the user on the page.
    }
    router.push(`/${locale}/login`);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-100"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
