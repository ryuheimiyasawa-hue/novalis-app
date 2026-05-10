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
  currentCategoryId: string | null;
  currentIsPublished: "true" | "false" | null;
}

const ALL = "__all__";

export function FaqsFilter({
  categories,
  currentCategoryId,
  currentIsPublished,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function navigate(next: { category_id?: string | null; is_published?: string | null }) {
    const url = new URLSearchParams(sp);
    if ("category_id" in next) {
      if (next.category_id) url.set("category_id", next.category_id);
      else url.delete("category_id");
    }
    if ("is_published" in next) {
      if (next.is_published) url.set("is_published", next.is_published);
      else url.delete("is_published");
    }
    router.push(`/admin/faqs${url.size ? `?${url.toString()}` : ""}`);
  }

  return (
    <div className="flex gap-3 items-center">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground block">公開状態</label>
        <Select
          value={currentIsPublished ?? ALL}
          onValueChange={(v) => navigate({ is_published: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            <SelectItem value="true">公開中</SelectItem>
            <SelectItem value="false">非公開</SelectItem>
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
