import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExpertsFilter } from "./experts-filter";
import { ExpertRowActions } from "./expert-row-actions";
import type { ExpertListRow } from "./types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ prefecture_code?: string; is_active?: string }>;
}

export default async function ExpertsPage({ searchParams }: PageProps) {
  let role: "admin" | "editor";
  try {
    const ctx = await requireEditor();
    role = ctx.role;
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/experts");
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const sp = await searchParams;
  const prefFilter = sp.prefecture_code || undefined;
  const activeFilter =
    sp.is_active === "true" || sp.is_active === "false" ? sp.is_active : undefined;

  const admin = getAdminClient();

  let query = admin
    .from("experts")
    .select(
      "id, name, title, prefecture_code, city_name, calendar_url, is_active, created_at",
    )
    .order("created_at", { ascending: false });
  if (prefFilter) query = query.eq("prefecture_code", prefFilter);
  if (activeFilter !== undefined)
    query = query.eq("is_active", activeFilter === "true");

  const { data, error } = await query;
  if (error) console.error("[admin/experts list] db error:", error.message);

  const experts = (data ?? []) as ExpertListRow[];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">士業</h1>
          <p className="text-sm text-muted-foreground">
            弁護士・行政書士・社労士などのエスカレ先を管理します。新規・編集は editor 以上、削除は admin のみ（参照中の場合は is_active=false 推奨）。
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/experts/new">新規登録</Link>
        </Button>
      </header>

      <ExpertsFilter
        currentPrefecture={prefFilter ?? null}
        currentIsActive={activeFilter ?? null}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">状態</TableHead>
              <TableHead>氏名 / 肩書</TableHead>
              <TableHead>所在</TableHead>
              <TableHead>予約 URL</TableHead>
              <TableHead className="w-40">登録日</TableHead>
              <TableHead className="w-40 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {experts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  該当する士業がありません
                </TableCell>
              </TableRow>
            )}
            {experts.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Badge variant={row.is_active ? "default" : "outline"}>
                    {row.is_active ? "有効" : "無効"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/experts/${row.id}/edit`}
                    className="hover:underline"
                  >
                    <span className="font-medium">{row.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {row.title}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.prefecture_code ?? "-"}
                  {row.city_name ? ` / ${row.city_name}` : ""}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground truncate max-w-xs">
                  {row.calendar_url ? (
                    <a
                      href={row.calendar_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {row.calendar_url}
                    </a>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleDateString("ja-JP")}
                </TableCell>
                <TableCell className="text-right">
                  <ExpertRowActions
                    expertId={row.id}
                    canDelete={role === "admin"}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
