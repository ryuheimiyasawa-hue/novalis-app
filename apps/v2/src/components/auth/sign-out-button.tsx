"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Sign-out affordance. The app previously had none, which stranded anyone who
// started an anonymous "try without signing in" session: every authed page
// accepts the anon session, so there was no route back to a real login short
// of clearing cookies by hand.
//
// The work happens in POST /api/auth/signout, not here: the session cookies
// are httpOnly (lib/supabase/server.ts), so browser JS cannot delete them —
// a client-side supabase.auth.signOut() would leave the user signed in.

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
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Navigate away regardless rather than trapping the user on the page.
      // If the cookies survived, the login page is still the right place to
      // land and they can retry from there.
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
