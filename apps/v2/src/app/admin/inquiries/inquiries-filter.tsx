"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABEL, STATUS_ORDER } from "./types";

interface Props {
  currentStatus: string | null;
}

const ALL = "__all__";

export function InquiriesFilter({ currentStatus }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function navigate(status: string | null) {
    const url = new URLSearchParams(sp);
    if (status) url.set("status", status);
    else url.delete("status");
    router.push(`/admin/inquiries${url.size ? `?${url.toString()}` : ""}`);
  }

  return (
    <div className="flex gap-3 items-center">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground block">状態</label>
        <Select
          value={currentStatus ?? ALL}
          onValueChange={(v) => navigate(v === ALL ? null : v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
