import { createClient } from "@/lib/supabase/server";
import { ok, fail } from "@/lib/api/response";

// Sign-out must happen server-side. The session cookies are written by the
// server client with httpOnly: true (see lib/supabase/server.ts), so a
// browser-side supabase.auth.signOut() can revoke the token at Supabase but
// physically cannot delete the cookie — the user would stay signed in.
//
// A Route Handler can write cookies, so the server client's setAll() actually
// clears them here.
export async function POST() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    // The cookies are cleared regardless of the network call's outcome, so the
    // user is signed out locally either way; log and report so the client can
    // still navigate away.
    console.warn("[auth/signout] signOut failed:", error.message);
    return fail("INTERNAL_ERROR");
  }
  return ok({ signedOut: true });
}
