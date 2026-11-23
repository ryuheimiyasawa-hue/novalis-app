import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPrefectureLabel } from "@/lib/i18n/prefectures";
import { Badge } from "@/components/ui/badge";
import { ApplicationActions } from "./application-actions";

export const dynamic = "force-dynamic";

const STATUSES = [
  { key: "pending", label: "審査待ち" },
  { key: "approved", label: "承認済み" },
  { key: "rejected", label: "却下" },
] as const;
type StatusKey = (typeof STATUSES)[number]["key"];

const LANG_LABEL = { ja: "日本語", en: "英語", tl: "タガログ語" } as const;

export default async function RestaurantApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/restaurant-applications");
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") redirect("/ja/dashboard");
    throw e;
  }

  const { status: rawStatus } = await searchParams;
  const status: StatusKey = STATUSES.some((s) => s.key === rawStatus)
    ? (rawStatus as StatusKey)
    : "pending";

  const { data, error } = await getAdminClient()
    .from("restaurant_applications")
    .select(
      "id, name, prefecture_code, city_name, address, hours, phone, website_url, description, description_lang, contact_name, contact_email, source_code, status, restaurant_id, created_at",
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`restaurant_applications load failed: ${error.message}`);
  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">飲食店の掲載申請</h1>
        <p className="text-sm text-muted-foreground">
          公開フォーム(/ja/restaurant-apply など)から届いた申請です。承認すると飲食店一覧に「公開」で追加されます。
          英語名・他言語の紹介文・写真は、承認後に飲食店の編集画面で足してください。
        </p>
      </div>

      <nav className="flex gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link
            key={s.key}
            href={`/admin/restaurant-applications?status=${s.key}`}
            className={`rounded-md border px-3 py-1.5 ${s.key === status ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">該当する申請はありません。</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="space-y-3 rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{r.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {getPrefectureLabel(r.prefecture_code, "ja")} {r.city_name} {r.address ?? ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.source_code && <Badge variant="outline">流入元 {r.source_code}</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </span>
                </div>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">営業時間</dt>
                <dd>{r.hours ?? "未記入"}</dd>
                <dt className="text-muted-foreground">電話</dt>
                <dd>{r.phone ?? "未記入"}</dd>
                <dt className="text-muted-foreground">URL</dt>
                <dd className="break-all">
                  {r.website_url ? (
                    <a href={r.website_url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline">
                      {r.website_url}
                    </a>
                  ) : (
                    "未記入"
                  )}
                </dd>
                <dt className="text-muted-foreground">紹介文({LANG_LABEL[r.description_lang]})</dt>
                <dd className="whitespace-pre-line">{r.description ?? "未記入"}</dd>
                <dt className="text-muted-foreground">担当者(非公開)</dt>
                <dd>
                  {r.contact_name} / {r.contact_email}
                </dd>
              </dl>
              {r.status === "pending" ? (
                <ApplicationActions applicationId={r.id} name={r.name} />
              ) : r.restaurant_id ? (
                <Link href={`/admin/restaurants/${r.restaurant_id}`} className="text-sm text-primary hover:underline">
                  掲載中の飲食店を編集する
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
