import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AuthError } from "./errors";

export async function requireAuth(): Promise<User> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new AuthError("UNAUTHORIZED");
  }
  // Sign-in is Facebook or email only (owner decision, 2026-11-23). Guest
  // sessions created by the retired "try without signing in" button are
  // treated as signed out, so they land on the login page.
  if (data.user.is_anonymous === true) {
    throw new AuthError("UNAUTHORIZED");
  }
  return data.user;
}
