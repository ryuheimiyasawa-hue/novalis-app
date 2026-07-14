"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InquiryStatus } from "@/lib/inquiries/schema";
import { STATUS_LABEL, STATUS_ORDER } from "./types";

interface Props {
  inquiryId: string;
  current: InquiryStatus;
}

export function InquiryStatusControl({ inquiryId, current }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<InquiryStatus>(current);
  const [pending, startTransition] = useTransition();

  async function change(next: InquiryStatus) {
    const previous = value;
    setValue(next); // optimistic
    const res = await fetch(`/api/admin/inquiries/${inquiryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      setValue(previous); // rollback
      toast.error(json?.error?.message ?? "状態の更新に失敗しました");
      return;
    }
    toast.success(`「${STATUS_LABEL[next]}」に更新しました`);
    startTransition(() => router.refresh());
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => change(v as InquiryStatus)}
      disabled={pending}
    >
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_ORDER.map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
