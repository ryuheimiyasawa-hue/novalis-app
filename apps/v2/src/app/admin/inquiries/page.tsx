import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
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
import { InquiryStatusEnum } from "@/lib/inquiries/schema";
import { InquiriesFilter } from "./inquiries-filter";
import { STATUS_LABEL } from "./types";
import type { InquiryListRow } from "./types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function InquiriesPage({ searchParams }: PageProps) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/inquiries");
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const sp = await searchParams;
  const statusFilter = InquiryStatusEnum.safeParse(sp.status);

  const admin = getAdminClient();

  let query = admin
    .from("inquiries")
    .select("id, subject, status, contact_email, created_at, user_id")
    .order("created_at", { ascending: false });
  if (statusFilter.success) query = query.eq("status", statusFilter.data);

  const { data, error } = await query;
  if (error) console.error("[admin/inquiries list] db error:", error.message);

  const base = data ?? [];

  // Batch-join display names (PostgREST embeds aren't described in the
  // hand-written Database type, so we resolve profiles separately — same
  // approach as the metrics page).
  const nameById = new Map<string, string | null>();
  const userIds = [...new Set(base.map((r) => r.user_id))];
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    for (const p of profiles ?? []) nameById.set(p.id, p.display_name);
  }

  const inquiries: InquiryListRow[] = base.map((r) => ({
    ...r,
    display_name: nameById.get(r.user_id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">問い合わせ</h1>
        <p className="text-sm text-muted-foreground">
          利用者からの問い合わせ・サポート依頼の受信箱です。行をクリックで詳細を開き、対応状況を更新できます（editor 以上）。
        </p>
      </header>

      <InquiriesFilter currentStatus={statusFilter.success ? statusFilter.data : null} />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">状態</TableHead>
              <TableHead>件名</TableHead>
              <TableHead>連絡先 / 送信者</TableHead>
              <TableHead className="w-40">受信日時</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inquiries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  該当する問い合わせがありません
                </TableCell>
              </TableRow>
            )}
            {inquiries.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Badge variant={row.status === "pending" ? "default" : "outline"}>
                    {STATUS_LABEL[row.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/inquiries/${row.id}`}
                    className="hover:underline font-medium"
                  >
                    {row.subject}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.contact_email ?? "-"}
                  {row.display_name ? (
                    <span className="ml-2 text-xs">（{row.display_name}）</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString("ja-JP")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
