# W5 設計書 — RAG + Web チャット UI（チャット完成）

**作成日**: 2026-05-11
**準拠**: `~/.claude/CLAUDE.md` Part 2.1
**前提**: W4 完了（Whitelist + Gemini + chat-pipeline）、W3 完了（admin + content + 公開 API）

---

## 1. スコープ

### 1-1. 含むもの

1. **Embedding パイプライン**: articles / faqs を chunk 化 → Gemini text-embedding-004 でベクトル化 → `content_embeddings` に保存
2. **RAG retrieval**: ユーザー質問を埋め込み → pgvector 類似検索 → 上位 N chunks を context として LLM に渡す
3. **chat-pipeline 拡張**: W4 の `processChat` に RAG context 注入を追加（KW/LLM Whitelist パスは前段のまま）
4. **会話永続化**: `conversations` / `messages` テーブルに記録、`chat_usage` カウンタ atomic 更新
5. **SSE ストリーミング**: `/api/chat/send` を Gemini streaming + Server-Sent Events で実装、token ごとにクライアントへ送出
6. **Web チャット UI**: `/[locale]/chat` ページ（会話一覧 + メッセージ送受信 + SSE 受信 + 引用記事プレビュー）
7. **エスカレ表示**: pipeline が `escalate` を返した時、experts 一覧 + calendar_url リンク表示
8. **i18n**: 既存 `messages/{ja,en,tl}.json` 拡張、UI 全文言を 3 言語対応
9. **Welcome Trial / クォータ判定**: `NEXT_PUBLIC_PAYMENT_ENABLED` flag に従い、Trial 期間中・有料 active は無制限、それ以外は月 3 回
10. **admin 用の embedding 再生成**: 記事/FAQ 編集時に自動 re-index（W3 admin write API に hook）

### 1-2. 含まないもの（W6 以降）

| 項目 | 行き先 | 理由 |
|---|---|---|
| Komoju 課金（プラン購入導線、checkout、webhook） | W6 | flag=false の MVP では発火しない |
| Messenger Bot 連携（同 conversations にチャネル別書き込み） | Phase 2 | MVP スコープ外（W3 終盤確定） |
| 管理画面での会話モニタリング UI（オペレーター介入） | Phase 2 | 自動応答での MVP 安定後 |
| 飲食店カタログ | W8 → Phase 2 | RAG コンテンツ対象外（運営選定型カタログ、検索ニーズ薄） |
| AI 出力の月次サンプリングレビュー UI | Phase 2 | `messages.whitelist_decision` JSONB 保存だけ W5 で実装、レビュー UI は後 |

---

## 2. データフロー図

### 2-1. メッセージ送信（normal answer path）

```
[ユーザー] /[locale]/chat 画面で入力 → POST /api/chat/send (SSE)
  │
  ├─ ① requireAuth() + Welcome Trial / Quota 判定
  │     NG → 402 QUOTA_EXCEEDED で購入導線
  │
  ├─ ② conversations の resolve（既存 or 新規）
  │
  ├─ ③ messages INSERT (role='user', content=入力)
  │
  ├─ ④ chat-pipeline.processChat({message, locale})
  │     │
  │     ├─ 0/1/2/3 W4 と同じ (length, PII, KW, LLM 分類器)
  │     │
  │     ├─ 4-pre: RAG retrieval
  │     │     │
  │     │     ├─ embed(message) → Gemini text-embedding-004 (768d)
  │     │     ├─ match_content RPC で類似 top 5 chunks 取得
  │     │     │   (locale フィルタ: 同一言語優先、同点ならスコア順)
  │     │     └─ context = chunks.map(c => c.text).join('\n---\n')
  │     │
  │     ├─ 4: generate(prompt + context) — Gemini Flash, streaming
  │     │
  │     └─ 5: 出力 PII mask + disclaimer 付与 + citations 計算
  │
  ├─ ⑤ SSE: token ごとに `data: {type:'token', text:'...'}\n\n` 送出
  │     最終: `data: {type:'done', meta:{...}, citations:[...]}\n\n`
  │
  └─ ⑥ messages INSERT (role='assistant', content=full text,
                          whitelist_decision=JSONB, citations=JSONB)
       chat_usage atomic +1（Trial / 有料以外のみ）
```

### 2-2. エスカレ path

```
② conversations resolve
③ user message INSERT
④ pipeline → escalate
⑤ SSE: 1 chunk で `data: {type:'escalate', body:..., experts:[...]}`
⑥ messages INSERT (role='system', content=escalation body, is_escalated=true)
   chat_usage は **加算しない**（master plan §2-4: エスカレ時はカウント対象外）
```

### 2-3. PII / too_long ブロック path

```
② conversations resolve（user message も保存しない選択肢あり、§4-3 で判断）
③ pipeline → blocked
④ SSE: 1 chunk で `data: {type:'blocked', body:...}`
⑤ messages INSERT は **しない**（PII を含む生入力を残さない）
   chat_usage 加算しない
```

### 2-4. Embedding 再生成 path（admin write hook）

```
admin POST/PATCH /api/admin/articles/[id] succeeds
  → revalidateArticles() (既存)
  → enqueueReindex({type:'article', id})  ← W5 新規
  → next tick で実行（in-process FIFO queue、cron 不要）
       a. 古い content_embeddings を delete WHERE source_id=id
       b. 記事を chunk 化、各 chunk embed
       c. INSERT content_embeddings rows
```

DELETE では古い embeddings を削除して終了。

---

## 3. データモデル

### 3-1. 既存テーブル（migration 001 で作成済、W5 で活用）

```sql
conversations (id, user_id, channel, title, mode, operator_user_id, operator_started_at, created_at, updated_at)
messages (id, conversation_id, role, sender_user_id, content, is_escalated, whitelist_decision JSONB, created_at)
content_embeddings (id, source_type, source_id, language, chunk_text, chunk_index, embedding VECTOR(768))
chat_usage (id, user_id, period_yyyymm, message_count, last_reset_at, UNIQUE(user_id, period_yyyymm))
profiles.trial_started_at, profiles.trial_ends_at（Welcome Trial 判定用）
subscriptions (id, user_id, plan_type, status, ends_at, ...)（active 判定用）
```

### 3-2. migration 004 で追加するもの

**判断**: スキーマ追加は最小化。W5 着手時に既存スキーマを `\d` で確認してから確定。

候補:
- ✅ **必須**: `messages.citations JSONB` 列（`{source_type, source_id, slug, snippet, score}[]` を保存、引用プレビュー再描画用）
- ✅ **必須**: `profiles.chat_retention_permanent BOOLEAN DEFAULT false` 列（§18 #4 確定: 30 日自動削除がデフォルト、user opt-in で永続）
- ✅ **必須**: `content_embeddings.embedding` の dim 確認（gemini-embedding-001 + MRL=768 のため `vector(768)` が前提、不一致なら ALTER）
- ✅ **必須**: `content_embeddings` の **HNSW index** 確認 / 追加
- ✅ **必須**: `match_content` RPC 関数の実装確認、未実装なら追加（locale フィルタ + similarity threshold + count 制限）
- ✅ **必須**: 古い conversations 削除用 SQL function（Vercel cron から日次呼び出し、§4-6 参照）
- 検討: `messages.metadata JSONB`（latency, tokens, model 等。`whitelist_decision` と統合可）

### 3-3. 会話保持ポリシー（§18 #4 user 採決により MVP 30日自動削除）

**user 判断（2026-05-11）**: 当初 Claude 推奨は「永続保存 (MVP)」だったが、user は逆転判断で **MVP デフォルト 30 日自動削除**を採用。理由:

1. 在日フィリピン人の機微情報（在留資格・家族問題）はデータ最小化が信頼の核心
2. GDPR / 個人情報保護法の「必要最小限保持」原則
3. Supabase Free tier 500MB ストレージ意識
4. 漏洩事故時の被害局所化

**実装**:
- `profiles.chat_retention_permanent BOOLEAN DEFAULT false`（user opt-in で永続化トグル）
- Vercel cron `/api/cron/purge-conversations` を JST 03:00 daily 実行
- SQL: `DELETE FROM conversations c WHERE c.created_at < NOW() - INTERVAL '30 days' AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = c.user_id AND p.chat_retention_permanent = true)`
- `messages` は ON DELETE CASCADE で自動削除（migration 001 の FK 設定確認）
- 設定 UI は `/[locale]/settings`（W5 E-7 で UI、W5 E-5 で API）
- プライバシーポリシーに「会話履歴は 30 日後に自動削除されます。永続保存をご希望の場合は設定からオン可能」を明記（弁護士監修時に reviewers に共有）

### 3-3. インデックス

```sql
-- content_embeddings (既存確認 + 必要なら追加)
CREATE INDEX ON content_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
-- ivfflat の方が build 速いが accuracy は HNSW、データ量により判断

-- messages (会話画面の最新順表示)
CREATE INDEX ON messages (conversation_id, created_at DESC);

-- chat_usage 既存
```

### 3-4. RLS ポリシー

既存 (migration 001):
- `conversations`, `messages`, `chat_usage`: 本人のみ
- `content_embeddings`: RLS は有効、ポリシーなし → service_role 専用（admin client で叩く）

W5 で追加変更: なし。embedding は admin client 経由のみ叩く。

---

## 4. RAG pipeline 設計

### 4-1. Embedding model 選択（経営判断ポイント）

**初稿の重大な誤り (2026-05-11 修正)**: 当初 `text-embedding-004` を採用としたが、これは **2026-01-14 で deprecated 済み**で本番利用不可。Lesson 16 として記録（「公式ドキュメントの推奨モデルは執筆時点で deprecated 済みのことがある」）。

| モデル | 次元 | 多言語 | 単価 | 状態 | 採用 |
|---|---|---|---|---|---|
| ~~Gemini text-embedding-004~~ | ~~768~~ | ~~✅~~ | ~~$0.025/1M chars~~ | **deprecated 2026-01-14** | ❌ |
| **Gemini gemini-embedding-001** + MRL=768 | 768 (MRL で 3072→768) | ✅ multilingual | $0.15 / 1M input tokens | 現行 stable | ✅ **採用** |
| Gemini gemini-embedding-001 (default) | 3072 | ✅ | 同上 | 現行 | storage 4x、HNSW 速度劣化、MVP 不要 |
| OpenAI text-embedding-3-small | 1536 | ✅ | $0.02 / 1M tok | 別ベンダー | 別 billing/監視で coordination cost |

**決定**: **`gemini-embedding-001` + `outputDimensionality: 768`**。理由:

1. **現行 stable model**（004 は deprecated、001 は MRL で柔軟に dim 制御可能）
2. **MRL (Matryoshka Representation Learning) で 768 に縮小**: 3072 デフォルトと比べて MTEB 差 2-3pt、実用差なし、Supabase pgvector HNSW 最適サイズ
3. 既存 schema が `vector(768)`（migration 001）なら ALTER 不要 → migration 004 で確認のみ
4. Gemini インフラ統一、generation と同じ API key / billing で運用
5. 多言語対応（ja / en / tl の semantic matching）

**コスト試算（gemini-embedding-001 paid tier）**:
- 初回 index: 100 art × 5 chunks × 500 chars × 3 lang × 0.25 tok/char ≒ 187.5K tok = **約 4 円**
- 月次 query: 1万 query × 50 chars/query × 0.25 = 125K tok = **約 3 円/月**
- **合計 月 10 円未満**（MVP 規模では誤差レベル）

### 4-1-bis. Free tier の確認（W5 E-1 着手時）

D-4 で発見したように、Gemini Free tier の数値は実測必須。**embedding API は generation API と quota が分かれている可能性**:
- 公称: gemini-embedding-001 Free tier RPM 5、RPD 100（要実測）
- W5 E-1 着手時に `RUN_LIVE_GEMINI_EMBED=1` で 1 call 流して数字を確認、判明次第 Lesson 15 を更新
- Free tier で再 index バッチ (~150 calls) が回らないなら billing 必須

### 4-2. 多言語戦略（経営判断ポイント）

| 戦略 | 説明 | メリット | デメリット | 採用 |
|---|---|---|---|---|
| **A: 単一空間 multilingual** | 1 chunk = 1 row、locale カラムで識別、検索は全 locale 対象 | クロス言語マッチ可（ja クエリで en 記事も拾える）、storage 1x | locale ごとの並びが混ざるリスク | ✅ **採用** |
| B: locale 別空間 | 言語ごとに別 namespace、検索は user locale のみ | 言語純度高、ranking 安定 | クロス言語マッチ不可、storage 3x | 不採用（multilingual モデルの強みを捨てる） |

**A 採用 + 後処理**: retrieval 時に user locale を 1.2 倍ブースト、同 locale chunk が無い時のみ他言語 chunk fallback。

### 4-3. Chunk 戦略

**articles（markdown body）**:
- 段落単位で分割（`\n\n` 区切り）
- 段落が 800 chars 超なら sentence 単位で再分割（500 chars / chunk 目標、100 chars overlap）
- 各 chunk に `[記事タイトル]` を prefix（検索精度向上）

**faqs**:
- Q + A セットで 1 chunk（分割しない）。Q だけだと検索ミスマッチ、A だけだと文脈不足

**実装**: `lib/ai/chunking.ts` に純粋関数として切り出し、unit test 可能化

### 4-4. Retrieval ロジック

```sql
-- match_content RPC (Postgres)
CREATE OR REPLACE FUNCTION match_content(
  query_embedding VECTOR(768),
  match_language TEXT,        -- 'ja' | 'en' | 'tl'
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 5
) RETURNS TABLE (
  source_type TEXT,
  source_id UUID,
  language TEXT,
  chunk_text TEXT,
  similarity FLOAT
) ...
```

**呼び出し側 (`lib/ai/rag.ts`)**:
1. `embed(query)` で 768 次元ベクトル取得
2. `match_content(qVec, locale, 0.3, 8)` で 8 chunks 取得
3. user locale chunk 優先、足りなければ他 locale で補完して 5 chunks に絞る
4. `articles` / `faqs` テーブルから該当 source_id の `slug` `title` を join 取得
5. context string + citations array を返す

### 4-5. Context injection into Gemini prompt

```
[system]
You are an information assistant for foreigners in Japan.
... (W4 system prompt 継承)
8. Use the following reference snippets if they are relevant to the
   user's question. If they are not relevant, ignore them.
   ALWAYS cite the source by [#1] [#2] notation when you use the
   information.

REFERENCE_BEGIN
[#1 src=article slug=visa-renewal lang=ja]
記事タイトル: 在留資格更新の基本手続き
〜段落〜
[#2 src=faq lang=ja]
Q: 在留期限を過ぎたらどうなりますか？
A: 〜
REFERENCE_END

[user]
USER_INPUT_BEGIN
{message}
USER_INPUT_END
```

LLM 出力中の `[#1]` `[#2]` を post-processing で `<a href="/[locale]/articles/visa-renewal">[1]</a>` に変換し、`citations` JSON に解決された URL/title/snippet を載せる。

---

## 5. SSE ストリーミング設計

### 5-1. プロトコル

Server-Sent Events、`text/event-stream`。1 イベント = 1 `data:` 行 + `\n\n` 区切り。

```
data: {"type":"meta","conversationId":"...","messageId":"..."}

data: {"type":"token","text":"在留"}

data: {"type":"token","text":"資格"}

...

data: {"type":"done","meta":{"latencyMs":3200,"tokensIn":850,"tokensOut":420,"finishReason":"STOP","piiMasked":false},"citations":[{"slug":"visa-renewal","title":"...","snippet":"..."}]}
```

エスカレ / ブロック時は `type:"escalate"` / `type:"blocked"` を 1 イベントだけ送って close。

### 5-2. Next.js 16 Route Handler 実装

```ts
export async function POST(req: NextRequest) {
  // ...auth, validation, conversation setup...
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      send({ type: "meta", conversationId, userMessageId });

      // chat-pipeline streaming variant
      const result = await processChatStream(
        { message, locale, conversationId },
        (token) => send({ type: "token", text: token }),
      );

      if (result.kind === "answer") {
        send({ type: "done", meta: result.meta, citations: result.citations });
      } else if (result.kind === "escalate") {
        send({ type: "escalate", body: result.text, detail: result.detail });
      } else {
        send({ type: "blocked", body: result.text, reason: result.reason });
      }

      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

### 5-3. クライアント側

`fetch()` + `ReadableStream` を使う（`EventSource` は POST 不可のため）:

```ts
const res = await fetch("/api/chat/send", {
  method: "POST",
  body: JSON.stringify({ message, conversationId }),
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value);
  const events = parseSSEFrames(buffer);  // splits on \n\n
  buffer = events.remainder;
  for (const ev of events.parsed) {
    handleEvent(JSON.parse(ev.data));
  }
}
```

`lib/chat/sse-client.ts` に切り出し。

### 5-4. AbortController

ユーザーが画面遷移 / Stop ボタン → `controller.abort()` → fetch cancel → サーバ側 `req.signal` でストリーム強制 close。Gemini SDK 側の中断は SDK の AbortSignal が伝搬するか W5 着手時に確認。

---

## 6. フロントエンド構造

### 6-1. ルーティング

```
/[locale]/chat                  - チャット画面（最新会話 or 新規開始）
/[locale]/chat/[conversationId] - 特定会話表示
```

注: `(authed)` route group 配下に配置 → middleware で requireAuth。

### 6-2. コンポーネント

```
src/components/chat/
├─ ChatLayout.tsx              # 左サイドバー(会話一覧) + メイン(メッセージ + 入力)
├─ ConversationList.tsx        # client、SWR で /api/chat/conversations を fetch
├─ MessageList.tsx             # 既存メッセージ表示、最下部 sticky scroll
├─ MessageBubble.tsx           # role=user / assistant / system で見た目分岐
├─ MessageInput.tsx            # textarea + 送信、IME composing 中は Enter 無視
├─ StreamingBubble.tsx         # streaming 中のトークン append、cursor 点滅
├─ EscalationCard.tsx          # type=escalate 時、experts 一覧表示
├─ BlockedNotice.tsx           # type=blocked 時、警告 + 再入力誘導
├─ CitationLink.tsx            # 記事リンクのインラインプレビュー (hover で snippet 表示)
└─ DisclaimerBadge.tsx         # 各 assistant メッセージ末尾に表示
```

### 6-3. State 管理

- 会話一覧: SWR、`/api/chat/conversations`
- 特定会話のメッセージ: SWR、`/api/chat/conversations/[id]/messages`
- 送信中の streaming bubble: ローカル React state、SSE 完了で SWR の cache invalidate

### 6-4. i18n

`messages/{ja,en,tl}.json` の `chat` namespace を W4 D-6 から拡張:
```json
{
  "chat": {
    "disclaimer": "...",         // W4 既存
    "escalation": "...",
    "piiBlock": "...",
    "tooLong": "...",
    "ui": {
      "newConversation": "新しい相談",
      "inputPlaceholder": "ご質問を入力してください…",
      "send": "送信",
      "stop": "停止",
      "loading": "回答中…",
      "errorRetry": "再送信",
      "quotaExceeded": "今月の無料枠を使い切りました。プランをアップグレードしてください。",
      "expertHeading": "おすすめの専門家",
      "expertSchedule": "予約する"
    }
  }
}
```

---

## 7. API 契約

### 7-1. 認証必須エンドポイント

| ルート | メソッド | 概要 | 認可 | レート |
|---|---|---|---|---|
| `/api/chat/send` | POST (SSE) | メッセージ送信 + streaming 応答 | requireAuth + quota | 60/min/user |
| `/api/chat/conversations` | GET | 自分の会話一覧 (channel='web' 中心) | requireAuth | 60/min |
| `/api/chat/conversations/[id]/messages` | GET | メッセージ履歴 | requireAuth + 所有 | 60/min |
| `/api/chat/conversations/[id]` | PATCH | title 編集 / archive | requireAuth + 所有 | 30/min |

### 7-2. レスポンス契約

`/api/chat/send` 以外は W3 の `ok` / `fail` envelope を流用。送信は SSE のため body 形式は §5-1 のとおり。

### 7-3. エラーコード追加

W3 既存に加えて:
- `QUOTA_EXCEEDED` (402): 月次無料枠超過、購入導線へ
- `CONVERSATION_NOT_FOUND` (404)

---

## 8. 状態遷移と副作用

### 8-1. メッセージ送信の副作用境界

| 段階 | 副作用 | TX 境界 |
|---|---|---|
| auth/quota check | なし（read only） | — |
| conversation resolve | 新規時 INSERT conversations | 単独 |
| user message INSERT | INSERT messages | 単独（escalate 時は user msg は保存、blocked PII 時は **保存しない**） |
| pipeline 実行 | Gemini API 2 calls (classifier + generate) | 非 TX、エラー時はそのまま escalate |
| assistant message INSERT + chat_usage +1 | INSERT messages + UPSERT chat_usage | **同一 TX**（カウンタずれ防止） |

### 8-2. chat_usage の atomic 更新

```sql
INSERT INTO chat_usage (user_id, period_yyyymm, message_count, last_reset_at)
VALUES ($1, $2, 1, NOW())
ON CONFLICT (user_id, period_yyyymm)
DO UPDATE SET message_count = chat_usage.message_count + 1;
```

JST 月初 lazy reset = `period_yyyymm` を JST で算出して挿入するだけで自動的に新月行が作られる。明示的な reset 処理は不要。

### 8-3. Welcome Trial 判定

```
allowed = (NOW() < profiles.trial_ends_at)
       OR (subscription.status = 'active' AND NOW() < subscription.ends_at)
       OR (chat_usage.message_count < 3 AND payment_enabled)
       OR (NOT payment_enabled)  ← MVP デフォルト
```

`NEXT_PUBLIC_PAYMENT_ENABLED=false` の MVP では常に通過。実装は書くが分岐は flag で短絡。

---

## 9. 異常系シナリオ（最低 7）

| # | シナリオ | 影響 | 対処 |
|---|---|---|---|
| 1 | Embedding API timeout / 429 | RAG context なしで生成すべきか escalate か | ✅ Context なし生成にフォールバック（ユーザー UX 維持）、ログに `rag_unavailable` を残す |
| 2 | match_content RPC エラー (e.g. extension 未有効) | RAG 全停止 | ✅ 起動時 health-check (W5 D-1 で確認)、本番では failsafe (context なし生成) |
| 3 | SSE 接続切断（ユーザー画面遷移） | Gemini API call は宙ぶらりん | ✅ AbortController で停止、partial 応答も `messages` に **保存しない**（incomplete を残さない方針） |
| 4 | 同一ユーザー並列送信 (race on chat_usage) | カウンタずれ | ✅ §8-2 の UPSERT で atomic |
| 5 | 会話 ID の他人指定 (IDOR) | 他人会話書き込み | ✅ conversation の user_id == auth.uid() を毎回検証、RLS で二重防御 |
| 6 | embedding 再生成中の admin DELETE | 古い embeddings が残る | ✅ admin DELETE 後に enqueueReindex({delete:true}) で content_embeddings DELETE |
| 7 | Gemini streaming で SAFETY block 途中混入 | UX 中断、partial 応答 | ✅ `finishReason='SAFETY'` 検知時、stream に `{type:'escalate'}` を最後に送って close、partial は messages に保存 (誠実な記録) |
| 8 | RAG が個別性高い chunk を取り出してしまう | LLM が個別助言を返す可能性 | ✅ chunk は published 記事 + is_published FAQ のみが対象（既に W3 でフィルタ済）、追加で「reference は一般情報のみ」を system prompt で強調 |
| 9 | 月次 reset の境界 race（23:59:59 JST に送信→00:00:00 で reset） | カウンタが 0 リセット直後に +1 → 旧月扱い | ✅ `period_yyyymm` を **送信時刻の JST 月**で算出、サーバ時刻 UTC でも JST 変換、テストで日付境界 case を追加 |

---

## 10. パフォーマンス想定

| 指標 | 目標 | 根拠 |
|---|---|---|
| chat send: First Token (P50) | 1.5 秒以内 | Whitelist 0.3s + RAG embed 0.3s + RAG match 0.1s + Gemini first token 0.5s |
| chat send: 完了 (P50) | 4 秒以内 | 上記 + Gemini 完答 1-2s |
| chat send: 完了 (P95) | 8 秒以内 | retry 含む |
| RAG retrieval (match_content RPC) | 100ms 以内 | HNSW、~1000 行規模 |
| Embedding API (1 query) | 300ms 以内 | text-embedding-004 公称 |
| 会話一覧 GET (P50) | 200ms 以内 | indexed query |
| Embedding コスト | <$1/月 (MAU 1万) | 100 art × 5 chunk × 500 chars × 3 lang × monthly re-index 1 回 + 1万 query × 50 chars/query |
| AI コスト合計 | $40-50/月 (MAU 1万) | embedding $1 + Gemini $40 (master plan §10) |

---

## 11. テスト戦略

| 層 | 内容 | 件数目標 |
|---|---|---|
| ユニット | chunking, rag context build, sse frame parser, citation extractor, chat_usage period calc | 50+ |
| ユニット (mock) | chat-pipeline streaming variant, Gemini streaming response handling | 15+ |
| 統合 (live, opt-in) | RAG retrieval against seed articles, /api/chat/send full E2E | 5+ |
| RLS | conversations / messages のクロステナント分離（W3 RLS test 拡張） | 既存 + 追加3 |
| E2E | Playwright で「ログイン→質問→ストリーミング応答→引用クリック」 | **1 本必須**（W5 終端） |

W3 と同様 E2E は最小限。Playwright を W5 で初導入する選択肢を STOP 2 で議論。

---

## 12. 実装ステップと STOP point

| サブ | 内容 | 想定 | STOP? |
|---|---|---|---|
| **E-1** | `lib/ai/embedding.ts` (Gemini text-embedding-004 wrapper) + unit test (mock) + 1 live probe | 1.5h |  |
| **E-2** | `lib/ai/chunking.ts` 純粋関数 + unit test、`scripts/reindex.ts` admin 手動実行用 | 1.5h |  |
| **E-3** | migration 004（必要分のみ）+ `match_content` RPC 確認 + `lib/ai/rag.ts` retrieval | 2h |  |
| **STOP 1** | RAG retrieval が seed articles から関連 chunks を返すか curl で確認 | — | ✅ |
| **E-4** | `chat-pipeline.ts` の RAG 拡張 + citations 計算 + streaming 版 `processChatStream` | 2.5h |  |
| **E-5** | `conversations` / `messages` 永続化 helper + `chat_usage` UPSERT + Welcome Trial check | 2h |  |
| **E-6** | `/api/chat/send` SSE endpoint + `/api/chat/conversations` 系 GET | 2h |  |
| **STOP 2** | curl + browser DevTools で SSE が token 単位で届くか、permanent 化されるか確認 | — | ✅ |
| **E-7** | Web チャット UI (ChatLayout, MessageList, MessageInput, StreamingBubble, EscalationCard, CitationLink) | 4h |  |
| **E-8** | i18n 文言追加（chat.ui namespace） + 動作確認 | 0.5h |  |
| **E-9** | RLS 拡張テスト + Playwright E2E 1 本 | 1.5h |  |
| **STOP 3** | E2E でログイン→質問→応答→引用クリックまで通る | — | ✅ |
| **E-10** | 5役割監査 + commit 分割 + Lesson 16 追記 + W5 完了報告 | 1h |  |
| **合計** | | **~18.5h ≒ 2-3 日** | |

### 12-1. STOP point の役割

- **STOP 1 (E-3 後)**: RAG が動かないと全体が止まる。embedding 失敗 / RPC 不在 / index 未貼り 等の外部要因を早く見つける
- **STOP 2 (E-6 後)**: SSE は実装ハマりやすい (Vercel buffering / proxy / EventSource 互換)。UI 着手前に streaming 動作を確定
- **STOP 3 (E-9 後)**: ベータ前夜に E2E が green = 安心して billing on → ローンチへ

---

## 13. 認可ポリシー

| リソース | 操作 | 認可 |
|---|---|---|
| `/api/chat/send` | POST | requireAuth() + quota check + payment_enabled flag |
| `/api/chat/conversations` | GET | requireAuth()（自分の会話のみ） |
| `/api/chat/conversations/[id]/messages` | GET | requireAuth() + RLS で他人会話遮断 |
| `messages` 書き込み (assistant role) | service_role 経由 (admin client)、API ハンドラ内のみ | — |
| `content_embeddings` | 全操作 service_role 経由 (RLS なし、ポリシーなし) | — |

**IDOR 防御**: API ルート tests で「他人の conversation_id で send / GET → 404 NOT_FOUND」を必須網羅。

---

## 14. 環境変数

W4 まで:
```
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_TIMEOUT_MS=
```

W5 で追加:
```
GEMINI_EMBEDDING_MODEL=text-embedding-004    # default
GEMINI_EMBEDDING_DIM=768                      # default、変更時は migration が必要
NEXT_PUBLIC_CHAT_STREAM_TIMEOUT_MS=60000      # client SSE 全体タイムアウト
```

---

## 15. 主要ファイル一覧

### 新規作成

```
apps/v2/src/lib/ai/
├─ embedding.ts          # text-embedding-004 wrapper
├─ chunking.ts            # markdown → chunks
└─ rag.ts                 # embed + match + context build + citations

apps/v2/src/lib/chat/
├─ persistence.ts         # conversations / messages / chat_usage helpers
├─ trial-quota.ts         # Welcome Trial / quota / payment flag check
└─ sse-client.ts          # ブラウザ側 SSE consumer

apps/v2/src/app/api/chat/
├─ send/route.ts          # SSE 主役
├─ conversations/route.ts # 一覧
├─ conversations/[id]/route.ts          # 単一会話操作
└─ conversations/[id]/messages/route.ts # メッセージ履歴

apps/v2/src/app/[locale]/(authed)/chat/
├─ layout.tsx
├─ page.tsx
├─ [conversationId]/page.tsx
└─ chat-shell.tsx

apps/v2/src/components/chat/
├─ ChatLayout.tsx, ConversationList.tsx, MessageList.tsx,
   MessageBubble.tsx, MessageInput.tsx, StreamingBubble.tsx,
   EscalationCard.tsx, BlockedNotice.tsx, CitationLink.tsx,
   DisclaimerBadge.tsx

apps/v2/supabase/migrations/004_w5_chat_columns.sql  # 必要なら

apps/v2/scripts/reindex.ts   # 手動 re-index 用 CLI
```

### 変更

```
apps/v2/src/lib/ai/chat-pipeline.ts    # processChatStream を追加
apps/v2/src/messages/{ja,en,tl}.json   # chat.ui namespace 追加
apps/v2/src/types/database.ts          # citations, content_embeddings の型追加
apps/v2/src/proxy.ts                   # /api/chat/* は requireAuth、現行設定で OK か確認
apps/v2/src/app/api/admin/articles/[id]/route.ts  # POST/PATCH/DELETE 後に enqueueReindex
apps/v2/src/app/api/admin/faqs/[id]/route.ts      # 同上
apps/v2/supabase/tests/rls.test.sql               # 会話の cross-tenant ケース追加
```

---

## 16. リスクマッピング（既存 W4 + W5 固有）

| ID | リスク | W5 で実施する対処 |
|---|---|---|
| L01-09 | 法的リスク (W4 で対処済) | RAG context が個別具体的助言を出さないか追加検証（W5 D-7 STOP 2 + E-9 RLS test） |
| S02 | プロンプトインジェクション | RAG chunks 内に injection が混入する可能性 → admin が公開する記事/FAQ を信頼できるソースとして扱う前提 (admin role が著者) |
| S07 | DDoS via SSE | 60/min/user レートリミット必須、AbortController で長時間接続を kill |
| D04 | コスト爆発 | embedding は admin write 時のみ生成、検索コストは検索 1 回 = $0.000025、月 1 万 query で $0.25 |
| D02 | ハルシネーション | RAG context あり時は「context 範囲外なら "確認が必要" と返す」を system prompt で強制、なし時は generic 警告 |
| D11 | RAG 障害 | embedding API timeout 時は context なしで generate へフォールバック、UX 維持 |

---

## 17. 着手前準備事項（W5 D-1 開始前）

- [ ] **W4 完了** (D-7 smoke + D-8 仕上げ) ← 本日 22:30 以降 or billing 有効化後
- [ ] **Gemini billing 有効化** ← W5 で embedding を実 API で叩くため必須（Free tier RPD 20 では再 index 1 回で枯渇）
- [ ] **migration 001 で `match_content` RPC が実装されているか確認**（Supabase Dashboard SQL Editor で `\df match_content`）
- [ ] **content_embeddings に index が貼られているか確認**（無ければ migration 004 で追加）
- [ ] **テスト用記事 5 件・FAQ 5 件**を admin UI から投入（reindex 動作確認用）

---

## 18. 経営判断ポイント（user 採決済 — 2026-05-11）

| # | 論点 | 採用 | 採用理由 |
|---|---|---|---|
| 1 | embedding model | **gemini-embedding-001 + outputDimensionality=768 (MRL)** | text-embedding-004 deprecated 発覚、001 は現行 stable、MRL で dim 縮小 → storage / HNSW 最適 |
| 2 | 多言語戦略 | **単一空間 multilingual + locale ブースト ×0.9** | クロス言語マッチ可、storage 1x。Phase 2 で Tagalog コーパス偏り検証 → locale 別 reranker 検討 |
| 3 | chunk size | **500 chars + overlap 100** | LangChain/LlamaIndex 標準、段落意味保持の最小 |
| 4 | conversations 保存ポリシー | **MVP デフォルト 30 日自動削除** + user opt-in 永続トグル | 機微情報のデータ最小化、GDPR/個情法、Supabase Free tier、漏洩事故時の被害局所化（user 採決で当初推奨を逆転） |
| 5 | SSE vs JSON 一括 | **SSE** | 4 秒待つ間トークン視認できる UX 差、Next.js 16 標準 ReadableStream で追加 dep 不要 |
| 6 | 会話継続方針 | **既存 active 会話に append + 手動「新規」ボタン** | ユーザー意図優先、自動新規は事故 |
| 7 | citation 表示 | **インライン `[1] [2]` + hover/tap で snippet** | 読みながら根拠確認、PWA モバイル対応 |
| 8 | E2E テスト導入 | **W5 終端で初導入（Playwright）** | チャットは MVP critical path、W6 Komoju checkout も同 E2E 拡張で守れる |

---

## 19. Definition of Done（W5）

- [ ] typecheck / lint / test / build 全 green
- [ ] ユニット 50+ / mock pipeline 15+ / live probe 動作 / RLS test 既存 + 追加 pass
- [ ] Playwright E2E 1 本 pass（ログイン → 質問 → ストリーミング → 引用クリック）
- [ ] `/[locale]/chat` で実際にチャットして以下を確認:
  - 一般質問 → RAG 引用付き Gemini 応答
  - 個別質問 → エスカレ + experts 表示
  - PII 入力 → ブロック警告
  - SSE token が 100ms 以下の遅延で見える
- [ ] AI 出力 30 件サンプリングで個別助言検出 0 件（W4 fixture 流用 + 追加 20 件）
- [ ] Lesson 16 で W5 で得た学びを追記

---

## 20. 未確定事項

1. **migration 001 の match_content RPC 実装状態**: 着手時に確認、未実装なら migration 004 で追加
2. **HNSW vs ivfflat**: ~1000 行規模では HNSW 推奨だが、Supabase 環境での pgvector バージョン確認必要
3. **Web Speech / 音声入力**: Phase 2、MVP は text only
4. **Conversation title 自動生成**: 初回応答時に Gemini で 5 単語以内のタイトル生成 → MVP 必要性低、Phase 2 検討
5. **Realtime（他デバイス間メッセージ同期）**: W7 オペレーターモード設計時に検討、MVP 不要

---

*本設計書は `~/.claude/CLAUDE.md` Part 2.1 に準拠。承認後、W4 完了を待って E-1 着手。*
