"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoryOption } from "./types";

interface Props {
  categories: CategoryOption[];
  currentStatus: "draft" | "published" | "archived" | null;
  currentCategoryId: string | null;
}

const ALL = "__all__";

export function ArticlesFilter({
  categories,
  currentStatus,
  currentCategoryId,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function navigate(next: { status?: string | null; category_id?: string | null }) {
    const url = new URLSearchParams(sp);
    if ("status" in next) {
      if (next.status) url.set("status", next.status);
      else url.delete("status");
    }
    if ("category_id" in next) {
      if (next.category_id) url.set("category_id", next.category_id);
      else url.delete("category_id");
    }
    router.push(`/admin/articles${url.size ? `?${url.toString()}` : ""}`);
  }

  return (
    <div className="flex gap-3 items-center">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground block">状態</label>
        <Select
          value={currentStatus ?? ALL}
          onValueChange={(v) => navigate({ status: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            <SelectItem value="draft">下書き</SelectItem>
            <SelectItem value="published">公開中</SelectItem>
            <SelectItem value="archived">アーカイブ</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground block">カテゴリ</label>
        <Select
          value={currentCategoryId ?? ALL}
          onValueChange={(v) => navigate({ category_id: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-60">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name_ja}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
