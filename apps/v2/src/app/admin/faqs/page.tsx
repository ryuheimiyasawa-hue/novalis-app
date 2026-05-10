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
import { FaqsFilter } from "./faqs-filter";
import { FaqRowActions } from "./faq-row-actions";
import type { FaqListRow } from "./types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ category_id?: string; is_published?: string }>;
}

export default async function FaqsPage({ searchParams }: PageProps) {
  let role: "admin" | "editor";
  try {
    const ctx = await requireEditor();
    role = ctx.role;
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/faqs");
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const sp = await searchParams;
  const categoryFilter = sp.category_id || undefined;
  const publishedFilter =
    sp.is_published === "true" || sp.is_published === "false"
      ? sp.is_published
      : undefined;

  const admin = getAdminClient();

  let faqsQuery = admin
    .from("faqs")
    .select(
      "id, category_id, question_ja, prefecture_code, is_published, sort_order, updated_at, created_at, category:categories(id, slug, name_ja)",
    )
    .order("category_id", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (categoryFilter) faqsQuery = faqsQuery.eq("category_id", categoryFilter);
  if (publishedFilter !== undefined)
    faqsQuery = faqsQuery.eq("is_published", publishedFilter === "true");

  const [faqsRes, categoriesRes] = await Promise.all([
    faqsQuery,
    admin
      .from("categories")
      .select("id, slug, name_ja")
      .order("sort_order", { ascending: true }),
  ]);

  if (faqsRes.error) console.error("[admin/faqs list] db error:", faqsRes.error.message);
  if (categoriesRes.error)
    console.error("[admin/faqs list] cat error:", categoriesRes.error.message);

  const faqs = (faqsRes.data ?? []) as FaqListRow[];
  const categories = categoriesRes.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">FAQ</h1>
          <p className="text-sm text-muted-foreground">
            よくある質問を管理します。新規・編集は editor 以上、削除は admin のみ。
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/faqs/new">新規 FAQ</Link>
        </Button>
      </header>

      <FaqsFilter
        categories={categories}
        currentCategoryId={categoryFilter ?? null}
        currentIsPublished={publishedFilter ?? null}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">公開</TableHead>
              <TableHead className="w-16">順</TableHead>
              <TableHead>質問</TableHead>
              <TableHead>カテゴリ</TableHead>
              <TableHead>地域</TableHead>
              <TableHead className="w-40">最終更新</TableHead>
              <TableHead className="w-40 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {faqs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  該当する FAQ がありません
                </TableCell>
              </TableRow>
            )}
            {faqs.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Badge variant={row.is_published ? "default" : "outline"}>
                    {row.is_published ? "公開中" : "非公開"}
                  </Badge>
                </TableCell>
                <TableCell>{row.sort_order}</TableCell>
                <TableCell className="max-w-md truncate">
                  <Link
                    href={`/admin/faqs/${row.id}/edit`}
                    className="hover:underline"
                    title={row.question_ja}
                  >
                    {row.question_ja}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.category?.name_ja ?? "-"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.prefecture_code ?? "全国"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(row.updated_at).toLocaleString("ja-JP")}
                </TableCell>
                <TableCell className="text-right">
                  <FaqRowActions faqId={row.id} canDelete={role === "admin"} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
