import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { FaqForm } from "../faq-form";

export const dynamic = "force-dynamic";

export default async function NewFaqPage() {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/faqs/new");
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
        <h1 className="text-2xl font-bold">新規 FAQ</h1>
        <p className="text-sm text-muted-foreground">
          非公開で作成されます。質問・回答の日本語が必須です。
        </p>
      </header>
      <FaqForm mode="create" categories={categories ?? []} />
    </div>
  );
}
