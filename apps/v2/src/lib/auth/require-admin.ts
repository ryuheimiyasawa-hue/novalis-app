import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "./require-auth";
import { AuthError } from "./errors";

export type AdminRole = "admin" | "editor";

export interface AdminContext {
  user: User;
  role: AdminRole;
}

async function fetchRole(userId: string): Promise<AdminRole | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("admin_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as AdminRole | undefined) ?? null;
}

export async function requireAdmin(): Promise<AdminContext> {
  const user = await requireAuth();
  const role = await fetchRole(user.id);
  if (role !== "admin") throw new AuthError("FORBIDDEN");
  return { user, role };
}

export async function requireEditor(): Promise<AdminContext> {
  const user = await requireAuth();
  const role = await fetchRole(user.id);
  if (role !== "admin" && role !== "editor") throw new AuthError("FORBIDDEN");
  return { user, role };
}

export async function requireOperatorRole(): Promise<AdminContext> {
  // Operator takeover is admin-only (W2 design §6-4, plan file §8).
  return requireAdmin();
}
