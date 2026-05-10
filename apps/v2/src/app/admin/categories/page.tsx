import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { CategoriesClient } from "./categories-client";
import type { CategoryRow } from "./types";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  let role: "admin" | "editor";
  try {
    const ctx = await requireEditor();
    role = ctx.role;
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/categories");
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("categories")
    .select(
      "id, slug, name_ja, name_en, name_tl, icon, sort_order, is_system, created_at",
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[admin/categories page] db error:", error.message);
  }
  const initial: CategoryRow[] = data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">カテゴリ</h1>
          <p className="text-sm text-muted-foreground">
            記事・FAQ の分類を管理します。新規追加・削除は admin のみ可能。
          </p>
        </div>
      </header>

      <CategoriesClient initial={initial} canMutate={role === "admin"} />
    </div>
  );
}
