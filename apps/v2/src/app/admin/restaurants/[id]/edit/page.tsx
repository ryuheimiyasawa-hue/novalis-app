import { notFound, redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { getAdminClient } from "@/lib/supabase/admin";
import { RestaurantForm } from "../../restaurant-form";
import type { RestaurantFull } from "../../types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const FULL_SELECT =
  "id, name, prefecture_code, city_name, address, lat, lng, cuisine_type, hours, photo_url, description_ja, description_en, description_tl, is_active, created_at";

export default async function EditRestaurantPage({ params }: PageProps) {
  const { id } = await params;
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect(`/ja/login?redirect=/admin/restaurants/${id}/edit`);
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("restaurants")
    .select(FULL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[admin/restaurants edit] db error:", error.message);

  const restaurant = data as RestaurantFull | null;
  if (!restaurant) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">飲食店を編集</h1>
        <p className="text-sm text-muted-foreground">
          登録: {new Date(restaurant.created_at).toLocaleString("ja-JP")}
        </p>
      </header>
      <RestaurantForm mode="edit" initial={restaurant} />
    </div>
  );
}
