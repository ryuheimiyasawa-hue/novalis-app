import { notFound, redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ArticleForm } from "../../article-form";
import type { ArticleFull } from "../../types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const FULL_SELECT =
  "id, category_id, slug, status, title_ja, title_en, title_tl, body_ja, body_en, body_tl, prefecture_code, city_name, author_id, published_at, created_at, updated_at";

export default async function EditArticlePage({ params }: PageProps) {
  const { id } = await params;
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect(`/ja/login?redirect=/admin/articles/${id}/edit`);
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const admin = getAdminClient();
  const [articleRes, categoriesRes] = await Promise.all([
    admin.from("articles").select(FULL_SELECT).eq("id", id).maybeSingle(),
    admin
      .from("categories")
      .select("id, slug, name_ja")
      .order("sort_order", { ascending: true }),
  ]);

  if (articleRes.error) {
    console.error("[admin/articles edit] db error:", articleRes.error.message);
  }
  const article = articleRes.data as ArticleFull | null;
  if (!article) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">記事を編集</h1>
        <p className="text-sm text-muted-foreground">
          slug: <code className="text-xs">{article.slug}</code>
          {article.published_at && (
            <>
              {" "}・ 初回公開: {new Date(article.published_at).toLocaleString("ja-JP")}
            </>
          )}
        </p>
      </header>
      <ArticleForm
        mode="edit"
        categories={categoriesRes.data ?? []}
        initial={article}
      />
    </div>
  );
}
