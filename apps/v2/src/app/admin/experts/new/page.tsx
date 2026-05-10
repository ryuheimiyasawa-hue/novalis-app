import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/errors";
import { ExpertForm } from "../expert-form";

export const dynamic = "force-dynamic";

export default async function NewExpertPage() {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHORIZED") {
      redirect("/ja/login?redirect=/admin/experts/new");
    }
    if (e instanceof AuthError && e.code === "FORBIDDEN") {
      redirect("/ja/dashboard");
    }
    throw e;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">新規士業</h1>
        <p className="text-sm text-muted-foreground">
          有効状態で作成されます。氏名・肩書が必須です。
        </p>
      </header>
      <ExpertForm mode="create" />
    </div>
  );
}
