"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActiveAdminNav } from "@/lib/admin/nav-active";

interface Item {
  href: string;
  label: string;
}

interface Props {
  items: ReadonlyArray<Item>;
}

export function AdminNavLinks({ items }: Props) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1 px-2">
      {items.map((item) => {
        const active = isActiveAdminNav(pathname ?? "", item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "block px-3 py-2 rounded-md text-sm bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "block px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
