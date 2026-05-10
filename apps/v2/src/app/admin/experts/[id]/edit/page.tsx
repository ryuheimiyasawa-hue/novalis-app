import { notFound, redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { ExpertForm } from "../../expert-form";
import type { ExpertFull } from "../../types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const FULL_SELECT =
  "id, name, title, specialty_ja, specialty_en, specialty_tl, bio_ja, bio_en, bio_tl, prefecture_code, city_name, avatar_url, calendar_url, is_active, created_at";

export default async function EditExpertPage({ params }: PageProps) {
  const { id } = await params;
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect(`/ja/login?redirect=/admin/experts/${id}/edit`);
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("experts")
    .select(FULL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[admin/experts edit] db error:", error.message);

  const expert = data as ExpertFull | null;
  if (!expert) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">士業を編集</h1>
        <p className="text-sm text-muted-foreground">
          登録: {new Date(expert.created_at).toLocaleString("ja-JP")}
        </p>
      </header>
      <ExpertForm mode="edit" initial={expert} />
    </div>
  );
}
