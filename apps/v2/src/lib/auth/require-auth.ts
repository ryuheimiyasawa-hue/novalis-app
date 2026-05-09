import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AuthError } from "./errors";

export async function requireAuth(): Promise<User> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new AuthError("UNAUTHORIZED");
  }
  return data.user;
}
