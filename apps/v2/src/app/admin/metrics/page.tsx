import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { getMetrics } from "@/lib/admin/metrics";

export const dynamic = "force-dynamic";

// /admin/metrics — 24h observability snapshot for the operator.
//
// Renders on every request (no caching) so the displayed counts always
// reflect the current DB state. Admin-only (not editor) because the
// raw activity numbers are sensitive operational data.
export default async function AdminMetricsPage() {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError && err.code === "FORBIDDEN") {
      redirect("/admin");
    }
    throw err;
  }

  const admin = getAdminClient();
  const m = await getMetrics(admin);
  const totalNewUsers = m.newUsers.anon + m.newUsers.permanent;
  const totalNewMessages = m.newMessages.user + m.newMessages.assistant;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">メトリクス</h1>
        <p className="text-sm text-muted-foreground">
          直近 24 時間のテスター利用状況。ページを開くたびに最新値を取得します。
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="新規ユーザ"
          value={totalNewUsers}
          subtext={`通常 ${m.newUsers.permanent} / ゲスト ${m.newUsers.anon}`}
        />
        <KpiCard
          title="新規会話"
          value={m.newConversations}
          subtext="conversations.created_at 基準"
        />
        <KpiCard
          title="メッセージ"
          value={totalNewMessages}
          subtext={`user ${m.newMessages.user} / assistant ${m.newMessages.assistant}`}
        />
        <KpiCard
          title="エスカレーション"
          value={m.escalations}
          subtext="is_escalated=true の messages"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">最近の会話 (直近 20 件)</h2>
        {m.recentConversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだ会話がありません。
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>開始日時</TableHead>
                  <TableHead>ユーザ</TableHead>
                  <TableHead>タイトル</TableHead>
                  <TableHead>モード</TableHead>
                  <TableHead className="text-right">メッセージ数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.recentConversations.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatJst(c.createdAt)}
                    </TableCell>
                    <TableCell>{c.displayName}</TableCell>
                    <TableCell className="max-w-[260px] truncate" title={c.title ?? ""}>
                      {c.title ?? <span className="text-muted-foreground">(無題)</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.mode === "operator" ? "default" : "secondary"}>
                        {c.mode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.messageCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

interface KpiProps {
  title: string;
  value: number;
  subtext: string;
}

function KpiCard({ title, value, subtext }: KpiProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-3xl font-bold tabular-nums">{value}</p>
        <CardDescription className="text-xs">{subtext}</CardDescription>
      </CardContent>
    </Card>
  );
}

const JST_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatJst(iso: string): string {
  try {
    return JST_FORMATTER.format(new Date(iso));
  } catch {
    return iso;
  }
}
