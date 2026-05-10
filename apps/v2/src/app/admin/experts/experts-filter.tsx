"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PREFECTURES } from "@/lib/i18n/prefectures";

interface Props {
  currentPrefecture: string | null;
  currentIsActive: "true" | "false" | null;
}

const ALL = "__all__";

export function ExpertsFilter({ currentPrefecture, currentIsActive }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function navigate(next: { prefecture_code?: string | null; is_active?: string | null }) {
    const url = new URLSearchParams(sp);
    if ("prefecture_code" in next) {
      if (next.prefecture_code) url.set("prefecture_code", next.prefecture_code);
      else url.delete("prefecture_code");
    }
    if ("is_active" in next) {
      if (next.is_active) url.set("is_active", next.is_active);
      else url.delete("is_active");
    }
    router.push(`/admin/experts${url.size ? `?${url.toString()}` : ""}`);
  }

  return (
    <div className="flex gap-3 items-center">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground block">状態</label>
        <Select
          value={currentIsActive ?? ALL}
          onValueChange={(v) => navigate({ is_active: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            <SelectItem value="true">有効</SelectItem>
            <SelectItem value="false">無効</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground block">都道府県</label>
        <Select
          value={currentPrefecture ?? ALL}
          onValueChange={(v) => navigate({ prefecture_code: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-60">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            {PREFECTURES.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.ja}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
