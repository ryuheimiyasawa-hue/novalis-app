import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { AdminRole } from "@/lib/auth/require-admin";
import { AdminNavLinks } from "./nav-links";

interface Props {
  role: AdminRole;
  displayName: string | null;
}

const ITEMS = [
  { href: "/admin", label: "ホーム" },
  { href: "/admin/metrics", label: "メトリクス" },
  { href: "/admin/categories", label: "カテゴリ" },
  { href: "/admin/articles", label: "記事" },
  { href: "/admin/faqs", label: "FAQ" },
  { href: "/admin/experts", label: "士業" },
  { href: "/admin/restaurants", label: "飲食店" },
  { href: "/admin/inquiries", label: "問い合わせ" },
];

export function AdminNav({ role, displayName }: Props) {
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="px-4 py-5 border-b border-sidebar-border">
        <Link href="/admin" className="font-bold text-lg">
          Novalis Admin
        </Link>
      </div>
      <nav className="flex-1 py-4">
        <AdminNavLinks items={ITEMS} />
      </nav>
      <div className="px-4 py-3 border-t border-sidebar-border space-y-1">
        {displayName && (
          <p className="text-sm truncate" title={displayName}>
            {displayName}
          </p>
        )}
        <Badge variant={role === "admin" ? "default" : "secondary"}>
          {role}
        </Badge>
      </div>
    </aside>
  );
}
