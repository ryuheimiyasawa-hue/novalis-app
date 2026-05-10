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
import { ArticlesFilter } from "./articles-filter";
import { ArticleRowActions } from "./article-row-actions";
import type { ArticleListRow, ArticleStatus } from "./types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: "下書き",
  published: "公開中",
  archived: "アーカイブ",
};

const STATUS_VARIANT: Record<ArticleStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  published: "default",
  archived: "secondary",
};

interface PageProps {
  searchParams: Promise<{ status?: string; category_id?: string }>;
}

export default async function ArticlesPage({ searchParams }: PageProps) {
  let role: "admin" | "editor";
  try {
    const ctx = await requireEditor();
    role = ctx.role;
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/articles");
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const sp = await searchParams;
  const statusFilter: ArticleStatus | undefined =
    sp.status === "draft" || sp.status === "published" || sp.status === "archived"
      ? sp.status
      : undefined;
  const categoryFilter = sp.category_id || undefined;

  const admin = getAdminClient();

  let articlesQuery = admin
    .from("articles")
    .select(
      "id, category_id, slug, status, title_ja, prefecture_code, published_at, updated_at, created_at, category:categories(id, slug, name_ja)",
    )
    .order("updated_at", { ascending: false });
  if (statusFilter) articlesQuery = articlesQuery.eq("status", statusFilter);
  if (categoryFilter) articlesQuery = articlesQuery.eq("category_id", categoryFilter);

  const [articlesRes, categoriesRes] = await Promise.all([
    articlesQuery,
    admin
      .from("categories")
      .select("id, slug, name_ja")
      .order("sort_order", { ascending: true }),
  ]);

  if (articlesRes.error) {
    console.error("[admin/articles list] db error:", articlesRes.error.message);
  }
  if (categoriesRes.error) {
    console.error("[admin/articles list] cat error:", categoriesRes.error.message);
  }
  const articles = (articlesRes.data ?? []) as ArticleListRow[];
  const categories = categoriesRes.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">記事</h1>
          <p className="text-sm text-muted-foreground">
            生活情報・行政手続案内などの記事を管理します。新規・編集は editor 以上、削除は admin のみ。
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/articles/new">新規記事</Link>
        </Button>
      </header>

      <ArticlesFilter
        categories={categories}
        currentStatus={statusFilter ?? null}
        currentCategoryId={categoryFilter ?? null}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">状態</TableHead>
              <TableHead>タイトル</TableHead>
              <TableHead>slug</TableHead>
              <TableHead>カテゴリ</TableHead>
              <TableHead>地域</TableHead>
              <TableHead className="w-40">最終更新</TableHead>
              <TableHead className="w-40 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {articles.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  該当する記事がありません
                </TableCell>
              </TableRow>
            )}
            {articles.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[row.status]}>
                    {STATUS_LABEL[row.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/articles/${row.id}/edit`}
                    className="hover:underline"
                  >
                    {row.title_ja}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.slug}
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
                  <ArticleRowActions
                    articleId={row.id}
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
