"use client";

import { useEffect, useRef, useState } from "react";
import { ChatShell } from "@/components/chat/ChatShell";

// Scripted stand-in for POST /api/chat/send. The harness installs it on
// window.fetch while this page is mounted, so the real ChatShell and the
// real SSE consumer run untouched while the network behaves the way the
// reviewer picks. Every answer below is a fixed dummy string; nothing
// leaves the browser.
type Scenario = "normal" | "slow" | "offline" | "break";

const SCENARIOS: Array<{ id: Scenario; label: string; hint: string }> = [
  { id: "normal", label: "ふつうに答える", hint: "0.4秒後にダミー回答。通常の送信が壊れていないかの確認" },
  {
    id: "slow",
    label: "応答を8秒遅らせる",
    hint: "送信したあと「新しい相談」を押す。旧回答と旧会話IDが混ざらないかの確認",
  },
  { id: "offline", label: "通信を失敗させる", hint: "送信できず入力欄が固まらないかの確認" },
  { id: "break", label: "途中で切断する", hint: "返答の受信中に回線が切れた場合の確認" },
];

const SSE_HEADERS = { "content-type": "text/event-stream" };
const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

function sse(text: string) {
  const events = [
    { type: "meta", conversationId: CONVERSATION_ID, period: "2026-10" },
    { type: "token", text },
    {
      type: "done",
      kind: "answer",
      text,
      disclaimer: "これは確認用のダミー応答です。実際のAIは呼び出していません。",
      citations: [],
      meta: {},
    },
  ];
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    status: 200,
    headers: SSE_HEADERS,
  });
}

function brokenStream() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          `data: ${JSON.stringify({ type: "token", text: "途中まで届いたダミー応答" })}\n\n`,
        ),
      );
      setTimeout(() => controller.error(new TypeError("Synthetic stream failure")), 400);
    },
  });
  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

function wait(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
    });
  });
}

type Entry = { at: string; text: string };

export function QaChatHarness({
  locale,
  labels,
}: {
  locale: "ja" | "en" | "tl";
  labels: React.ComponentProps<typeof ChatShell>["labels"];
}) {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [log, setLog] = useState<Entry[]>([]);
  const [shellKey, setShellKey] = useState(0);
  const scenarioRef = useRef<Scenario>("normal");
  // The stub reads the choice through a ref so it never has to be
  // reinstalled; keep that ref in step with the radio buttons.
  useEffect(() => {
    scenarioRef.current = scenario;
  }, [scenario]);

  const add = (text: string) =>
    setLog((prev) => [
      ...prev.slice(-19),
      { at: new Date().toLocaleTimeString("ja-JP", { hour12: false }), text },
    ]);

  useEffect(() => {
    const real = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/api/chat/send")) return real(input, init);

      const mode = scenarioRef.current;
      const body = init?.body ? (JSON.parse(String(init.body)) as { conversationId?: string }) : {};
      add(`送信: ${mode} / 相談ID ${body.conversationId ?? "なし（新規）"}`);
      const signal = init?.signal ?? null;
      signal?.addEventListener("abort", () => add("中止: 前のリクエストが取り消された"));

      try {
        if (mode === "offline") {
          await wait(400, signal);
          add("応答: 通信失敗（合成）");
          throw new TypeError("Synthetic network failure");
        }
        if (mode === "break") {
          await wait(400, signal);
          add("応答: 受信途中で切断（合成）");
          return brokenStream();
        }
        await wait(mode === "slow" ? 8000 : 400, signal);
        const text =
          mode === "slow"
            ? "遅れて届いた旧相談のダミー回答"
            : "確認用のダミー回答です。これは生活相談の内容ではありません。";
        add(`応答: ダミー回答を返した（${mode}）`);
        return sse(text);
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") add("応答: 中止済みのため返さなかった");
        throw e;
      }
    };
    return () => {
      window.fetch = real;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-4">
      <header className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        <p className="font-semibold">確認用ページ（本番には出ません）</p>
        <p>
          チャット画面の2件の修正を試す場所です。AI、データベース、Messenger、決済には一切つながっていません。
          回答はすべて固定のダミー文です。
        </p>
      </header>

      <section className="grid gap-2 rounded-md border border-border p-3 text-sm">
        <p className="font-semibold">1. 通信のふるまいを選ぶ</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <label
              key={s.id}
              className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 ${
                scenario === s.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="scenario"
                className="mt-1"
                checked={scenario === s.id}
                onChange={() => {
                  setScenario(s.id);
                  add(`設定: ${s.label}`);
                }}
              />
              <span>
                <span className="font-medium">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          手順: 下のチャット欄に何か書いて送信します。「応答を8秒遅らせる」では、送信してすぐ右上の
          新しい相談を押し、旧回答が出てこないことと、次の送信が新規相談として送られること（記録欄の
          相談IDが「なし（新規）」）を確認してください。
        </p>
        <button
          type="button"
          onClick={() => {
            setShellKey((k) => k + 1);
            setLog([]);
            add("チャット画面を初期状態に戻しました");
          }}
          className="w-fit rounded-md border border-border px-3 py-1 text-xs hover:bg-accent/40"
        >
          チャット画面を初期化する
        </button>
      </section>

      <section className="min-h-[28rem] overflow-hidden rounded-md border border-border">
        <ChatShell
          key={shellKey}
          locale={locale}
          labels={labels}
          // Stay on this page instead of navigating to /ja/chat, which
          // has no session here. The reset itself is unchanged.
          onReset={() => add("リセット: 新しい相談に切り替えた（旧リクエストは中止）")}
        />
      </section>

      <section className="rounded-md border border-border p-3 text-sm">
        <p className="font-semibold">記録（確認用の応答が何をしたか）</p>
        <ul className="mt-1 grid gap-0.5 font-mono text-xs text-muted-foreground">
          <li>確認用の応答に差し替え済みです。実際のAPIは呼びません。</li>
          {log.length === 0 ? <li>まだ送信されていません。</li> : null}
          {log.map((e, i) => (
            <li key={i}>
              {e.at} {e.text}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
