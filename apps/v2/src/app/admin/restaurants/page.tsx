import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RestaurantsFilter } from "./restaurants-filter";
import { RestaurantRowActions } from "./restaurant-row-actions";
import type { RestaurantListRow } from "./types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ prefecture_code?: string; is_active?: string }>;
}

export default async function RestaurantsPage({ searchParams }: PageProps) {
  let role: "admin" | "editor";
  try {
    const ctx = await requireEditor();
    role = ctx.role;
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/restaurants");
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const sp = await searchParams;
  const prefFilter = sp.prefecture_code || undefined;
  const activeFilter =
    sp.is_active === "true" || sp.is_active === "false" ? sp.is_active : undefined;

  const admin = getAdminClient();

  let query = admin
    .from("restaurants")
    .select(
      "id, name, prefecture_code, city_name, cuisine_type, is_active, created_at",
    )
    .order("created_at", { ascending: false });
  if (prefFilter) query = query.eq("prefecture_code", prefFilter);
  if (activeFilter !== undefined)
    query = query.eq("is_active", activeFilter === "true");

  const { data, error } = await query;
  if (error) console.error("[admin/restaurants list] db error:", error.message);

  const restaurants = (data ?? []) as RestaurantListRow[];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">飲食店</h1>
          <p className="text-sm text-muted-foreground">
            フィリピン料理店・食材店を管理します。新規・編集は editor 以上、削除は admin のみ（一時的に隠すだけなら「非掲載」を推奨）。
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/restaurants/new">新規登録</Link>
        </Button>
      </header>

      <RestaurantsFilter
        currentPrefecture={prefFilter ?? null}
        currentIsActive={activeFilter ?? null}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">状態</TableHead>
              <TableHead>店名</TableHead>
              <TableHead>ジャンル</TableHead>
              <TableHead>所在</TableHead>
              <TableHead className="w-40">登録日</TableHead>
              <TableHead className="w-40 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {restaurants.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  該当する飲食店がありません
                </TableCell>
              </TableRow>
            )}
            {restaurants.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Badge variant={row.is_active ? "default" : "outline"}>
                    {row.is_active ? "掲載中" : "非掲載"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/restaurants/${row.id}/edit`}
                    className="hover:underline font-medium"
                  >
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.cuisine_type ?? "-"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.prefecture_code}
                  {row.city_name ? ` / ${row.city_name}` : ""}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleDateString("ja-JP")}
                </TableCell>
                <TableCell className="text-right">
                  <RestaurantRowActions
                    restaurantId={row.id}
                    canDelete={role === "admin"}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
