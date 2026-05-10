// Pure helper for highlighting the active item in <AdminNavLinks />.
// Kept outside the React tree so it stays trivial to unit-test under
// the Node-only vitest environment.
export function isActiveAdminNav(pathname: string, href: string): boolean {
  if (href === "/admin") {
    // Top dashboard: match only the exact path so it stops being highlighted
    // once the operator drills into a section.
    return pathname === "/admin";
  }
  return pathname === href || pathname.startsWith(href + "/");
}
