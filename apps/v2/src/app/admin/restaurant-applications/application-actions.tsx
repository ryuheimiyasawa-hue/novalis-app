"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ApplicationActions({
  applicationId,
  name,
}: {
  applicationId: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function act(action: "approve" | "reject") {
    const question =
      action === "approve"
        ? `「${name}」を承認して、飲食店一覧に公開で追加しますか?`
        : `「${name}」の申請を却下しますか?`;
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/restaurant-applications/${applicationId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(
          res.status === 409
            ? "この申請はすでに処理済みです"
            : (json?.error?.message ?? "処理に失敗しました"),
        );
        return;
      }
      toast.success(action === "approve" ? "承認して公開しました" : "却下しました");
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={busy} onClick={() => act("approve")}>
        承認して公開
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => act("reject")}>
        却下
      </Button>
    </div>
  );
}
