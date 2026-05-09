import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "./require-auth";
import { AuthError } from "./errors";

export interface OnboardedProfile {
  id: string;
  prefecture_code: string;
  city_name: string;
  preferred_language: "ja" | "en" | "tl";
  onboarded_at: string;
}

export async function requireOnboarded(): Promise<OnboardedProfile> {
  const user = await requireAuth();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, prefecture_code, city_name, preferred_language, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.onboarded_at) {
    throw new AuthError("ONBOARDING_REQUIRED");
  }
  return profile as OnboardedProfile;
}
