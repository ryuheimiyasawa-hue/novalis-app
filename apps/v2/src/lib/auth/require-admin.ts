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
  //
  // P2-B2 revisited this and kept it: adding a separate 'operator' role
  // means a CHECK-constraint migration on admin_roles, and today the
  // only person answering users is the admin. When staff who must NOT
  // touch the CMS start handling conversations, extend the CHECK and
  // accept 'operator' here — deliberately NOT `requireEditor`, since
  // editing articles and speaking to users are different privileges
  // (design doc §10-b).
  return requireAdmin();
}
