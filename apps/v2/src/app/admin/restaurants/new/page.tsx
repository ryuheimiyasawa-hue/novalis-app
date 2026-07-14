import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { RestaurantForm } from "../restaurant-form";

export const dynamic = "force-dynamic";

export default async function NewRestaurantPage() {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/restaurants/new");
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">新規飲食店</h1>
        <p className="text-sm text-muted-foreground">
          掲載中の状態で作成されます。店名・都道府県・市区町村が必須です。
        </p>
      </header>
      <RestaurantForm mode="create" />
    </div>
  );
}
