import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "./require-auth";
import { AuthError } from "./errors";
import {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} from "@/lib/legal/versions";

export async function requireConsent(): Promise<void> {
  const user = await requireAuth();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("consent_logs")
    .select("document_type, version")
    .eq("user_id", user.id)
    .in("document_type", ["terms", "privacy"]);

  const latest = new Map<string, string>();
  for (const r of rows ?? []) {
    const prev = latest.get(r.document_type);
    if (!prev || r.version > prev) latest.set(r.document_type, r.version);
  }

  if (
    latest.get("terms") !== CURRENT_TERMS_VERSION ||
    latest.get("privacy") !== CURRENT_PRIVACY_VERSION
  ) {
    throw new AuthError("STALE_CONSENT");
  }
}
