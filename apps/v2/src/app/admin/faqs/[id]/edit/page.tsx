import { notFound, redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { FaqForm } from "../../faq-form";
import type { FaqFull } from "../../types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const FULL_SELECT =
  "id, category_id, question_ja, question_en, question_tl, answer_ja, answer_en, answer_tl, prefecture_code, is_published, sort_order, created_at, updated_at";

export default async function EditFaqPage({ params }: PageProps) {
  const { id } = await params;
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect(`/ja/login?redirect=/admin/faqs/${id}/edit`);
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const admin = getAdminClient();
  const [faqRes, categoriesRes] = await Promise.all([
    admin.from("faqs").select(FULL_SELECT).eq("id", id).maybeSingle(),
    admin
      .from("categories")
      .select("id, slug, name_ja")
      .order("sort_order", { ascending: true }),
  ]);

  if (faqRes.error) {
    console.error("[admin/faqs edit] db error:", faqRes.error.message);
  }
  const faq = faqRes.data as FaqFull | null;
  if (!faq) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">FAQ を編集</h1>
        <p className="text-sm text-muted-foreground">
          作成: {new Date(faq.created_at).toLocaleString("ja-JP")} ・ 最終更新:{" "}
          {new Date(faq.updated_at).toLocaleString("ja-JP")}
        </p>
      </header>
      <FaqForm
        mode="edit"
        categories={categoriesRes.data ?? []}
        initial={faq}
      />
    </div>
  );
}
