import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/nav";
import { Toaster } from "@/components/ui/sonner";

// /admin/* — operator console for editors and admins.
// Sits outside the [locale] tree because the admin UI is staffed in
// Japanese only (W3-design.md §1 Q1) and i18n overhead is unjustified
// at this stage. Authentication uses the same Supabase session as the
// rest of the app; ロール判定は requireEditor() で実施。
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let role: "admin" | "editor";
  let userId: string;
  try {
    const ctx = await requireEditor();
    role = ctx.role;
    userId = ctx.user.id;
  } catch (err) {
    if (err instanceof AuthError && err.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin");
    }
    if (err instanceof AuthError && err.code === "FORBIDDEN") {
      // Logged in but no editor/admin role -> bounce to dashboard.
      redirect("/ja/dashboard");
    }
    throw err;
  }

  // Fetch display name for the sidebar footer.
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  return (
    <div className="min-h-screen flex">
      <AdminNav role={role} displayName={profile?.display_name ?? null} />
      <main className="flex-1 p-6 bg-background">{children}</main>
      <Toaster />
    </div>
  );
}
