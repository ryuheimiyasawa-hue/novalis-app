"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  restaurantId: string;
  canDelete: boolean;
}

export function RestaurantRowActions({ restaurantId, canDelete }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function remove() {
    if (
      !window.confirm(
        "この飲食店を削除します。元に戻せません（一時的に隠すだけなら「非掲載」を推奨）。よろしいですか？",
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/restaurants/${restaurantId}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      toast.error(json?.error?.message ?? "削除に失敗しました");
      return;
    }
    toast.success("削除しました");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-x-2">
      <Button asChild size="sm" variant="outline">
        <Link href={`/admin/restaurants/${restaurantId}/edit`}>編集</Link>
      </Button>
      {canDelete && (
        <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
          削除
        </Button>
      )}
    </div>
  );
}
