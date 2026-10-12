import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { WhitelistLocale } from "@/lib/ai/whitelist-keywords";
import jaMessages from "@/messages/ja.json";
import enMessages from "@/messages/en.json";
import tlMessages from "@/messages/tl.json";

// Messenger has no cards, so the escalation that the web renders as
// EscalationCard has to arrive as one message. The web shows the lawyer
// text, then the active experts, then the support link; a Messenger user
// was getting only the first of the three and no way to reach anyone.
// Same source of truth: the `experts` rows the public directory exposes
// and the `chat.ui` strings the card uses.

const COPY = { ja: jaMessages.chat.ui, en: enMessages.chat.ui, tl: tlMessages.chat.ui };

interface ExpertRow {
  name: string;
  title: string;
  specialty_ja: string | null;
  specialty_en: string | null;
  specialty_tl: string | null;
  calendar_url: string | null;
}

function specialtyOf(e: ExpertRow, locale: WhitelistLocale): string {
  if (locale === "en") return e.specialty_en ?? e.specialty_ja ?? "";
  if (locale === "tl") return e.specialty_tl ?? e.specialty_ja ?? "";
  return e.specialty_ja ?? "";
}

/** Active experts, newest first — the same set and order as /api/experts. */
export async function loadActiveExperts(
  admin: SupabaseClient<Database>,
  limit = 3,
): Promise<ExpertRow[]> {
  const { data, error } = await admin
    .from("experts")
    .select("name, title, specialty_ja, specialty_en, specialty_tl, calendar_url")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error(
      JSON.stringify({ event: "messenger_experts_load_failed", message: error.message }),
    );
    return [];
  }
  return (data ?? []) as ExpertRow[];
}

/**
 * The escalation message for Messenger: lawyer-approved text, the expert
 * list when there is one, and the support link. Never throws — a missing
 * expert list only shortens the message.
 */
export function buildEscalationReply(
  escalationText: string,
  experts: ExpertRow[],
  locale: WhitelistLocale,
  appUrl: string,
): string {
  const copy = COPY[locale] ?? COPY.ja;
  const parts = [escalationText];

  if (experts.length > 0) {
    const lines = experts.map((e) => {
      const specialty = specialtyOf(e, locale);
      const head = specialty ? `・${e.name}（${e.title}／${specialty}）` : `・${e.name}（${e.title}）`;
      return e.calendar_url ? `${head}\n  ${copy.expertSchedule}: ${e.calendar_url}` : head;
    });
    parts.push(`${copy.expertHeading}\n${lines.join("\n")}`);
  }

  if (appUrl) parts.push(`${copy.contactCta}: ${appUrl}/${locale}/contact`);
  return parts.join("\n\n");
}
