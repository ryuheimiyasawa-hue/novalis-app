import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { WhitelistLocale } from "@/lib/ai/whitelist-keywords";
import jaMessages from "@/messages/ja.json";
import enMessages from "@/messages/en.json";
import tlMessages from "@/messages/tl.json";
import { escalationFormPath } from "@/lib/chat/escalation-form";

// Messenger has no cards, so the escalation that the web renders as
// EscalationCard has to arrive as one message, in the same order: the
// lawyer-approved text, then the consultation form to fill in first, then
// the active experts as reference.
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
 * The escalation message for Messenger: lawyer-approved text, the
 * consultation form link, and the expert list when there is one. Never
 * throws: a missing expert list only shortens the message.
 */
export function buildEscalationReply(
  escalationText: string,
  experts: ExpertRow[],
  locale: WhitelistLocale,
  appUrl: string,
): string {
  const copy = COPY[locale] ?? COPY.ja;
  const parts = [escalationText];

  // First step, same as the web card: the consultation form.
  if (appUrl) parts.push(`${copy.escalationFormStep}\n${appUrl}${escalationFormPath(locale)}`);

  if (experts.length > 0) {
    const lines = experts.map((e) => {
      const specialty = specialtyOf(e, locale);
      const head = specialty ? `・${e.name}（${e.title}／${specialty}）` : `・${e.name}（${e.title}）`;
      return e.calendar_url ? `${head}\n  ${copy.expertSchedule}: ${e.calendar_url}` : head;
    });
    parts.push(`${copy.expertHeading}\n${lines.join("\n")}`);
  }

  return parts.join("\n\n");
}
