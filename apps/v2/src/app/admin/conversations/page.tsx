import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConversationsFilter } from "./conversations-filter";
import { CHANNEL_LABEL, MODE_LABEL } from "./types";
import type { ConversationListRow, ConvChannel, ConvMode } from "./types";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;

interface PageProps {
  searchParams: Promise<{ channel?: string; mode?: string }>;
}

export default async function ConversationsPage({ searchParams }: PageProps) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/conversations");
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/admin");
    }
    throw e;
  }

  const sp = await searchParams;
  const channelFilter =
    sp.channel === "web" || sp.channel === "messenger"
      ? (sp.channel as ConvChannel)
      : undefined;
  const modeFilter =
    sp.mode === "auto" || sp.mode === "operator"
      ? (sp.mode as ConvMode)
      : undefined;

  const admin = getAdminClient();

  let query = admin
    .from("conversations")
    .select("id, title, channel, mode, user_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (channelFilter) query = query.eq("channel", channelFilter);
  if (modeFilter) query = query.eq("mode", modeFilter);

  const { data, error } = await query;
  if (error) console.error("[admin/conversations list] db error:", error.message);

  const base = data ?? [];

  // Batch message counts + display names (mirrors the metrics page).
  const ids = base.map((c) => c.id);
  const userIds = [...new Set(base.map((c) => c.user_id))];
  const countByConv = new Map<string, number>();
  const nameByUser = new Map<string, string | null>();
  if (ids.length > 0) {
    const [{ data: msgs }, { data: profiles }] = await Promise.all([
      admin.from("messages").select("conversation_id").in("conversation_id", ids),
      admin.from("profiles").select("id, display_name").in("id", userIds),
    ]);
    for (const m of (msgs ?? []) as Array<{ conversation_id: string }>) {
      countByConv.set(m.conversation_id, (countByConv.get(m.conversation_id) ?? 0) + 1);
    }
    for (const p of profiles ?? []) nameByUser.set(p.id, p.display_name);
  }

  const conversations: ConversationListRow[] = base.map((c) => ({
    ...c,
    display_name: nameByUser.get(c.user_id) ?? null,
    message_count: countByConv.get(c.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">会話</h1>
        <p className="text-sm text-muted-foreground">
          利用者と AI（および運営）の会話を閲覧します。個別会話の全文・エスカレ証跡を確認できます（管理者のみ・閲覧専用、直近{LIST_LIMIT}件）。
        </p>
      </header>

      <ConversationsFilter
        currentChannel={channelFilter ?? null}
        currentMode={modeFilter ?? null}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">状態</TableHead>
              <TableHead className="w-28">チャネル</TableHead>
              <TableHead>タイトル / 利用者</TableHead>
              <TableHead className="w-20 text-right">件数</TableHead>
              <TableHead className="w-40">最終更新</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversations.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  該当する会話がありません
                </TableCell>
              </TableRow>
            )}
            {conversations.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Badge variant={c.mode === "operator" ? "default" : "outline"}>
                    {MODE_LABEL[c.mode]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {CHANNEL_LABEL[c.channel]}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/conversations/${c.id}`}
                    className="hover:underline"
                  >
                    <span className="font-medium">{c.title ?? "（無題）"}</span>
                    {c.display_name ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.display_name}
                      </span>
                    ) : null}
                  </Link>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {c.message_count}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(c.updated_at).toLocaleString("ja-JP")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
