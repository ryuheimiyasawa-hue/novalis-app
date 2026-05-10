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
    status: "C-3 で実装",
  },
  {
    href: "/admin/articles",
    title: "記事",
    description:
      "生活情報・行政手続案内などの記事を作成・公開します。markdown で執筆。",
    status: "C-4 で実装",
  },
  {
    href: "/admin/faqs",
    title: "FAQ",
    description: "よくある質問の Q/A を管理します。カテゴリ単位で並び順を変更可能。",
    status: "C-5 で実装",
  },
  {
    href: "/admin/experts",
    title: "士業",
    description:
      "弁護士・行政書士・社労士などのエスカレ先を登録します。AI チャットの誘導先。",
    status: "C-6 で実装",
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
