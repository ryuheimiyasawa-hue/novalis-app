import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { AdminRole } from "@/lib/auth/require-admin";

interface Props {
  role: AdminRole;
  displayName: string | null;
}

const ITEMS = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/categories", label: "カテゴリ" },
  { href: "/admin/articles", label: "記事" },
  { href: "/admin/faqs", label: "FAQ" },
  { href: "/admin/experts", label: "士業" },
];

// Server component sidebar for /admin layout. The nav itself doesn't need
// active-state tracking yet (the W3 admin pages are still flat); when we
// need it we can split out a small client component reading usePathname().
export function AdminNav({ role, displayName }: Props) {
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="px-4 py-5 border-b border-sidebar-border">
        <Link href="/admin" className="font-bold text-lg">
          Novalis Admin
        </Link>
      </div>
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
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
