"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ElapsedSince } from "@/components/admin/elapsed-since";

// P2-B2 operator控制パネル。閲覧専用だった会話ビューア (PR #15) に
// 「対応を引き取る / 返信する / 対応を終える」を足す部分だけを
// クライアント側に切り出したもの。状態遷移そのものは API 側の RPC が
// 担当し、ここは呼び出しと表示に徹する。

interface Props {
  conversationId: string;
  channel: string;
  mode: "auto" | "operator";
  operatorUserId: string | null;
  operatorStartedAt: string | null;
  operatorName: string | null;
  viewerUserId: string;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok || !payload?.ok) {
    throw new Error(
      payload?.error?.message ?? payload?.error?.code ?? `HTTP ${res.status}`,
    );
  }
  return payload;
}

export function OperatorPanel({
  conversationId,
  channel,
  mode,
  operatorUserId,
  operatorStartedAt,
  operatorName,
  viewerUserId,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [content, setContent] = useState("");

  if (channel !== "web") {
    return (
      <section className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Messenger の会話はこの画面から対応できません。返信を Messenger 側へ送り返す経路が未実装のため、
        引き取り操作を無効にしています。
      </section>
    );
  }

  const isHolder = mode === "operator" && operatorUserId === viewerUserId;
  const heldByOther = mode === "operator" && operatorUserId !== viewerUserId;

  async function run(fn: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(successMessage);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <h2 className="text-sm font-semibold">運営対応</h2>

      {mode === "auto" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            引き取ると、この会話の AI 自動応答が停止します。利用者の発言は保存され続けます。
          </p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="引き取り理由（任意・記録用、利用者には表示されません）"
            maxLength={500}
            disabled={busy}
          />
          <Button
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  postJson(
                    `/api/admin/conversations/${conversationId}/takeover`,
                    reason.trim() ? { reason: reason.trim() } : {},
                  ),
                "この会話を引き取りました",
              )
            }
          >
            対応を引き取る
          </Button>
        </div>
      )}

      {heldByOther && (
        <div className="space-y-2">
          <p className="text-sm">
            {operatorName ?? "別の担当者"} が対応中
            {operatorStartedAt && (
              <>
                （<ElapsedSince since={operatorStartedAt} />
                経過）
              </>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            担当者が戻れない場合のみ、強制的に解除して AI 応答を再開できます。
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  postJson(`/api/admin/conversations/${conversationId}/release`, {
                    force: true,
                  }),
                "対応を強制解除しました",
              )
            }
          >
            強制的に解除する
          </Button>
        </div>
      )}

      {isHolder && (
        <div className="space-y-3">
          <p className="text-sm">
            あなたが対応中
            {operatorStartedAt && (
              <>
                （<ElapsedSince since={operatorStartedAt} />
                経過）
              </>
            )}
            。AI の自動応答は停止しています。
          </p>
          <Textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="利用者への返信を入力（2500 文字まで）"
            maxLength={2500}
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !content.trim()}
              onClick={() =>
                run(async () => {
                  await postJson(
                    `/api/admin/conversations/${conversationId}/messages`,
                    { content: content.trim() },
                  );
                  setContent("");
                }, "返信を送信しました")
              }
            >
              返信を送信
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    postJson(
                      `/api/admin/conversations/${conversationId}/release`,
                      {},
                    ),
                  "対応を終了しました。AI 応答を再開します",
                )
              }
            >
              対応を終える
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
