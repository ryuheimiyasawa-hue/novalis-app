import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { InquiryStatusControl } from "../inquiry-status-control";
import type { InquiryFull } from "../types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const FULL_SELECT =
  "id, subject, message, contact_email, status, created_at, updated_at, user_id";

export default async function InquiryDetailPage({ params }: PageProps) {
  const { id } = await params;
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect(`/ja/login?redirect=/admin/inquiries/${id}`);
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("inquiries")
    .select(FULL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[admin/inquiries detail] db error:", error.message);
  if (!data) notFound();

  let displayName: string | null = null;
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", data.user_id)
    .maybeSingle();
  displayName = profile?.display_name ?? null;

  const inquiry = { ...data, display_name: displayName } as InquiryFull;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/inquiries">← 一覧へ戻る</Link>
        </Button>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{inquiry.subject}</h1>
        <p className="text-sm text-muted-foreground">
          受信: {new Date(inquiry.created_at).toLocaleString("ja-JP")}
          {inquiry.updated_at !== inquiry.created_at && (
            <>　/　最終更新: {new Date(inquiry.updated_at).toLocaleString("ja-JP")}</>
          )}
        </p>
      </header>

      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-1">
          <p className="text-xs text-muted-foreground">対応状況</p>
          <InquiryStatusControl inquiryId={inquiry.id} current={inquiry.status} />
        </div>
        <div className="col-span-4 space-y-1">
          <p className="text-xs text-muted-foreground">連絡先メール</p>
          {inquiry.contact_email ? (
            <a
              href={`mailto:${inquiry.contact_email}`}
              className="text-sm font-medium text-primary hover:underline break-all"
            >
              {inquiry.contact_email}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">-</p>
          )}
        </div>
        <div className="col-span-4 space-y-1">
          <p className="text-xs text-muted-foreground">送信者</p>
          <p className="text-sm">{inquiry.display_name ?? "（表示名なし）"}</p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">本文</h2>
        <div className="rounded-md border bg-muted/20 p-4 text-sm whitespace-pre-wrap break-words">
          {inquiry.message}
        </div>
      </section>
    </div>
  );
}
