import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ArticleForm } from "../article-form";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/articles/new");
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const admin = getAdminClient();
  const { data: categories } = await admin
    .from("categories")
    .select("id, slug, name_ja")
    .order("sort_order", { ascending: true });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">新規記事</h1>
        <p className="text-sm text-muted-foreground">
          下書きとして作成されます。タイトル日本語と本文日本語が必須です。
        </p>
      </header>
      <ArticleForm mode="create" categories={categories ?? []} />
    </div>
  );
}
