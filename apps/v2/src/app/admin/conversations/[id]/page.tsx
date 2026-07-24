import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CHANNEL_LABEL, MODE_LABEL, ROLE_LABEL } from "../types";
import type { ConversationMessageRow, ConvChannel, ConvMode, MsgRole } from "../types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Read-only thread styling per role.
const ROLE_STYLE: Record<MsgRole, string> = {
  user: "ml-auto bg-primary/10",
  assistant: "mr-auto bg-muted",
  operator: "mr-auto bg-blue-500/10 border border-blue-500/30",
  system: "mx-auto bg-amber-500/10 text-center text-xs",
};

export default async function ConversationDetailPage({ params }: PageProps) {
  const { id } = await params;
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect(`/ja/login?redirect=/admin/conversations/${id}`);
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/admin");
    }
    throw e;
  }

  const admin = getAdminClient();
  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .select("id, title, channel, mode, user_id, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (convErr) console.error("[admin/conversations detail] db error:", convErr.message);
  if (!conv) notFound();

  const [{ data: profile }, { data: msgs, error: msgErr }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", conv.user_id).maybeSingle(),
    admin
      .from("messages")
      .select("id, role, content, is_escalated, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (msgErr) console.error("[admin/conversations messages] db error:", msgErr.message);

  const messages = (msgs ?? []) as ConversationMessageRow[];
  const displayName = profile?.display_name ?? "（表示名なし）";

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/conversations">← 一覧へ戻る</Link>
        </Button>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{conv.title ?? "（無題）"}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant={conv.mode === "operator" ? "default" : "outline"}>
            {MODE_LABEL[conv.mode as ConvMode]}
          </Badge>
          <Badge variant="secondary">{CHANNEL_LABEL[conv.channel as ConvChannel]}</Badge>
          <span>{displayName}</span>
          <span>・開始 {new Date(conv.created_at).toLocaleString("ja-JP")}</span>
        </div>
      </header>

      <section className="space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">メッセージがありません。</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-md p-3 ${ROLE_STYLE[m.role]}`}
          >
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">{ROLE_LABEL[m.role]}</span>
              <span>{new Date(m.created_at).toLocaleString("ja-JP")}</span>
              {m.is_escalated && (
                <Badge variant="outline" className="text-[10px]">
                  エスカレ
                </Badge>
              )}
            </div>
            <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
