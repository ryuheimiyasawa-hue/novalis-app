import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SECTIONS = [
  {
    href: "/admin/categories",
    title: "カテゴリ",
    description:
      "コンテンツの分類を管理します。記事と FAQ の親階層になります。",
    status: "C-3 実装済",
  },
  {
    href: "/admin/articles",
    title: "記事",
    description:
      "生活情報・行政手続案内などの記事を作成・公開します。markdown で執筆。",
    status: "C-4 実装済",
  },
  {
    href: "/admin/faqs",
    title: "FAQ",
    description: "よくある質問の Q/A を管理します。カテゴリ単位で並び順を変更可能。",
    status: "C-5 実装済",
  },
  {
    href: "/admin/experts",
    title: "士業",
    description:
      "弁護士・行政書士・社労士などのエスカレ先を登録します。AI チャットの誘導先。",
    status: "C-6 実装済",
  },
  {
    href: "/admin/restaurants",
    title: "飲食店",
    description:
      "フィリピン料理店・食材店のカタログを管理します。トップページと一覧に掲載。",
    status: "P2-J 実装済",
  },
  {
    href: "/admin/inquiries",
    title: "問い合わせ",
    description:
      "利用者からの問い合わせ・サポート依頼の受信箱。対応状況を管理します。",
    status: "P2-M 実装済",
  },
  {
    href: "/admin/conversations",
    title: "会話",
    description:
      "利用者と AI の会話を閲覧します。個別会話の全文・エスカレ証跡を確認（管理者のみ）。",
    status: "P2-B1 実装済",
  },
  {
    href: "/admin/metrics",
    title: "メトリクス",
    description:
      "会話数・メッセージ数・エスカレ件数などの運営指標を確認します（直近24時間）。",
    status: "運営指標",
  },
];

export default function AdminTopPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">管理画面</h1>
        <p className="text-sm text-muted-foreground">
          コンテンツの管理と運営者向け機能をここから操作します。
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.href}>
            <CardHeader>
              <CardTitle>
                <Link href={s.href} className="hover:underline">
                  {s.title}
                </Link>
              </CardTitle>
              <CardDescription>{s.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-block rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                {s.status}
              </span>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
