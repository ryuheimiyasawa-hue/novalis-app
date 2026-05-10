# W4 設計書 — Whitelist + Gemini 接続（AI チャットの心臓部）

**作成日**: 2026-05-11
**準拠**: `~/.claude/CLAUDE.md` Part 2.1（設計フェーズ必須項目）
**前提**: W3 完了（admin + content CRUD + 公開 GET API）、Lesson 14 の設計パターン群

---

## 1. スコープ

### 1-1. 含むもの（W4）

1. **Gemini クライアント**: `lib/ai/gemini.ts` — 公式 SDK ラッパー、timeout / retry / コスト記録
2. **PII 検出**: `lib/pii/detect.ts` — 在留カード番号 / パスポート / マイナンバー / 電話 / メール 等を入力時にブロック
3. **Whitelist (個別性検知)**: 二段階構成
   - `lib/ai/whitelist-keywords.ts` — 多言語キーワード正規表現
   - `lib/ai/whitelist-llm.ts` — Gemini Flash で yes/no 自己判定
4. **チャット応答パイプライン**: `lib/ai/chat-pipeline.ts` — PII → Whitelist KW → Whitelist LLM → Gemini 生成 → ディスクレーマー付与
5. **ディスクレーマー / エスカレ文言**: `messages/{ja,en,tl}.json` に追加、エスカレ先は experts テーブルから service_role で取得
6. **smoke テスト endpoint**: `/api/chat/preview` — 認証必須・1メッセージで pipeline を試せる admin/dev 用 (本番では editor+ 限定)
7. **テスト**: PII / Whitelist KW のユニットテスト、Gemini 呼び出しは mock + integration smoke

### 1-2. 含まないもの（W5 以降）

| 項目 | 行き先 | 理由 |
|---|---|---|
| Web チャット UI（会話一覧、メッセージ送受信、履歴閲覧） | W5 | UI を W4 に入れると D-1〜D-8 が膨張、smoke endpoint で十分検証可能 |
| **SSE ストリーミング応答** | W5 | 消費する UI が無い段階で SSE 配管を作っても unverifiable。Gemini 側 streaming API は W5 で同時に組む |
| RAG (`content_embeddings` + 検索 + コンテキスト注入) | W5 | embedding 生成バッチ + ivfflat 検索 + プロンプト注入が一塊。W4 は無 RAG の素 Gemini で先に基盤を固める |
| `conversations` / `messages` への永続化（chat_usage カウンタ更新含む） | W5 | チャット UI と同時に組む方が責務境界がクリア。W4 は **stateless** な pipeline |
| Welcome Trial 判定 / 月次クォータ判定 | W5 | 永続化と一体 |
| Messenger Bot 経由の入力 | Phase 2 | MVP スコープ外（W3 終盤で確定） |
| AI 出力の日次サンプリングレビュー UI | Phase 2 | `messages.whitelist_decision` を JSONB で残せば後付け可能 |

### 1-3. ストリーミングを W4 に含めない理由（user §5 への回答）

ストリーミング応答（SSE）を W4 に含めるべきか検討した。**W5 に倒すのが正解**。理由:

1. **消費者（Web チャット UI）が無い**: W4 で SSE エンドポイントを作っても、W5 の UI が完成するまで「動いた」と確認できない。`curl -N` で stream は読めるが、「最終的にユーザー画面で正しく描画される」までを W4 内で検証できない。
2. **Gemini SDK の streaming と非 streaming で API 形が違う**: 一度どちらかで実装すると、W5 で UI の都合で逆方向に作り直すコストがある。W5 で UI と同時に決めるのが効率的。
3. **W4 のリスクは別所にある**: W4 で詰まりやすいのは Gemini API キー設定 / Whitelist の偽陰性 / プロンプト調整。ここに集中したい。
4. **smoke endpoint は同期で十分**: `/api/chat/preview` は 4 秒程度で完答返却、admin が「Whitelist が効いている」「Gemini が答える」を確認するに足る。

---

## 2. データフロー図

```
┌─ POST /api/chat/preview {message, locale} ─────────────────┐
│                                                             │
│  ① requireEditor() (W4 では admin/editor 限定の smoke)      │
│  ② Zod 入力検証 (message <= 2000, locale enum)              │
│                                                             │
│  ┌───────────────────────────────────────────────────┐      │
│  │ chat-pipeline.ts:processChat({message, locale})   │      │
│  │                                                   │      │
│  │ ③ detectPii(message)                              │      │
│  │     hit → return {kind: 'blocked', piiTypes}      │      │
│  │                                                   │      │
│  │ ④ detectIndividualKeywords(message, locale)       │      │
│  │     hit → return {kind: 'escalate', kw}           │      │
│  │                                                   │      │
│  │ ⑤ classifyIndividualLLM(message, locale)          │      │
│  │     [Gemini Flash, JSON モード, 30s timeout]      │      │
│  │     is_individual=true → return {kind: 'escalate'}│      │
│  │                                                   │      │
│  │ ⑥ generateAnswer(message, locale)                 │      │
│  │     [Gemini Flash, system prompt + user msg]      │      │
│  │     return {kind: 'answer', text, disclaimer}     │      │
│  └───────────────────────────────────────────────────┘      │
│                                                             │
│  ⑦ ok({...result, latencyMs, tokensIn, tokensOut})          │
└─────────────────────────────────────────────────────────────┘

エスカレ時のレスポンス:
  {kind: 'escalate', escalation: {
    message: "個別の状況に応じた助言は専門家にご相談ください…",
    experts: [{name, title, calendar_url, ...}]  // is_active=true 限定
  }}

ブロック時:
  {kind: 'blocked', reason: 'pii', piiTypes: ['zairyu_card'],
   userMessage: "個人情報（在留カード番号など）は送信できません…"}

回答時:
  {kind: 'answer', text: "<Gemini 生成>", disclaimer: "<ja/en/tl>",
   model: 'gemini-2.5-flash', tokensIn, tokensOut, latencyMs}
```

---

## 3. Whitelist（個別性検知）の実装方針

### 3-1. アーキテクチャ選択

| 方式 | 速度 | コスト | 偽陰性リスク | 採用 |
|---|---|---|---|---|
| キーワード正規表現のみ | <1ms | 0 | **高**（バリエーション漏れ） | ❌ 単独では不十分 |
| 埋め込み類似度のみ | 100-300ms | 中 | 中（閾値調整難） | ❌ MVP では over-engineer |
| LLM 自己判定のみ | 500-1500ms | 中 | 低 | ❌ コスト + 遅延 |
| **キーワード → LLM の二段階** | 0-1500ms | 低-中 | **最低** | ✅ **採用**（master plan §2-2） |

**狙い**: キーワードで明確な個別質問を 0ms で弾く（偽陽性 OK）→ 残りを LLM が判定（偽陰性を最小化）→ それも通った場合のみ Gemini に渡す。

### 3-2. キーワード検知（`lib/ai/whitelist-keywords.ts`）

**個別性を示すシグナル**（master plan §2-2 から拡張）:

| 言語 | キーワード例 |
|---|---|
| ja | 「私の」「うちの」「具体的に」「いくら」「何ヶ月」「不当な」「請求できますか」「訴えたい」「離婚したい」「解雇された」「在留期限が」「先月」「来月までに」 |
| en | "my", "I was", "can I sue", "how much do I owe", "I want to divorce", "I was fired", "my visa expired" |
| tl | "ako", "akin", "magkano", "puwede ko bang", "pina-divorce", "tinanggal sa trabaho" |

**実装**: 言語ごとの正規表現リスト（word boundary 考慮）。マッチした最初のキーワードを返す。

```ts
export interface KeywordHit { keyword: string; locale: string; }
export function detectIndividualKeywords(message: string, locale: 'ja'|'en'|'tl'): KeywordHit | null;
```

**偽陽性 vs 偽陰性のトレードオフ**: **偽陽性側に寄せる**。「ビザの種類は？」のような完全に一般的な質問でも、「私のビザの種類は？」と書かれたら個別判定でエスカレ。これは **コンサバな運用**として許容（むしろ専門家経由の方がユーザー利益）。

### 3-3. LLM 自己判定（`lib/ai/whitelist-llm.ts`）

**プロンプト設計**:

```
You are a classifier. Decide whether the user's question requires SPECIFIC,
PERSONALIZED legal / tax / immigration / labor advice (i.e. an individual
case), or whether it is asking for GENERAL public information that any
professional would answer the same way for everyone.

Examples — INDIVIDUAL (return true):
  - "My visa expires next month, can I still apply for renewal?"
  - "My employer didn't pay overtime, can I sue?"
  - "I want to divorce my husband, what should I do?"

Examples — GENERAL (return false):
  - "How long is a Working Visa valid in Japan?"
  - "What documents are required for renewing a Spouse Visa?"
  - "How does the Japanese pension system work for foreigners?"

Reply with JSON only, no prose:
  {"is_individual": true|false, "reason": "<one short sentence in English>"}

User question:
  ---
  <ユーザー入力>
  ---
```

**実装上の注意**:
- Gemini Flash の **JSON モード**（`responseSchema` または `responseMimeType: "application/json"`）を使ってパース失敗を防ぐ
- 30 秒 timeout、3 回 exponential backoff
- 失敗時は **fail-safe = エスカレ**（master plan §9 #1: timeout 時は Whitelist フェールセーフ）
- レスポンス JSON は `{is_individual, reason}` 固定スキーマで Zod parse

### 3-4. 「dimming（個別助言を一般情報に薄める）」の検討

user §3 で「拒否時の dimming 設計」が要望に含まれている。**MVP では採用しない**:

- リスク: dimming する prompt 設計を間違えると、結局 LLM が個別具体的助言を返すリスクが残る（士業法違反）
- 代替: **明確に「専門家に」と誘導する文面 + 連絡先（experts）を返す**方が法的に安全
- Phase 2 での再検討: コミュニティが大きくなり「全部エスカレ」が UX 上重い場合に再考

エスカレ文言テンプレ（messages/ja.json 抜粋案）:
```
"chat.escalate.title": "専門家にご相談ください",
"chat.escalate.body": "ご質問は個別の状況に応じた専門家の判断が必要な内容です。下記の士業がサポートできます。",
"chat.escalate.disclaimer": "AI による情報提供はあくまで一般的なものです。"
```

---

## 4. Gemini API 接続

### 4-1. モデル選択

| モデル | 入力 / 出力 単価 | レイテンシ | タガログ品質 | 採用 |
|---|---|---|---|---|
| Gemini 2.5 Flash | $0.075 / $0.30 per 1M | ~1-2s | 高（Google 系の強み） | ✅ **デフォルト**（master plan §3 確定） |
| Gemini 2.5 Pro | $1.25 / $5.00 per 1M | ~3-5s | 最高 | 将来 dimming や複雑質問用、MVP 不採用 |

**決定**: 全用途 Flash 一本化。コスト試算 (master plan §10 = MAU1万人で月3-5万円) は Flash 前提。

### 4-2. SDK 選択

`@google/genai` 公式 SDK（W1 で `^1.52.0` 指定済、現最新 2.0.1）。**バージョン**: 設計フェーズで一度 `npm view @google/genai version` で最新を確認、breaking change がなければ最新へ bump。実装着手時に `pnpm view` で再確認。

### 4-3. プロンプト構造（生成系）

```
[system]
You are an information assistant for foreigners (mostly Filipino) living
in Japan. You answer GENERAL questions about visas, social insurance,
school, family law, and administrative procedures.

CRITICAL RULES:
1. Provide only general public information — never give advice about a
   specific person's situation.
2. If the question is borderline, say "this varies by individual
   situation; please consult a professional" and stop.
3. Always respond in the user's language: {locale}.
4. Cite the source agency name when relevant (e.g., 入管庁, 日本年金機構).
5. Never echo back numeric IDs the user might have included (residence
   card numbers, passport numbers, My Number) — those are PII and were
   blocked at input but treat any leakage as a defect.

[user]
{question}
```

**ディスクレーマー併記**: pipeline 側で system prompt とは別に、最終応答末尾に `messages/{locale}.json` の `chat.disclaimer` を**コードで結合**する（LLM に書かせると忘れる時があるため）。

### 4-4. レート制限とエラーハンドリング

| 失敗 | 検知 | 対処 |
|---|---|---|
| 429 (Quota) | SDK Error | 30s 待機 + exponential backoff 最大3回 |
| 5xx | SDK Error | 同上 |
| Timeout | AbortController 30s | Whitelist フェールセーフ（エスカレ案内） |
| 不正 JSON (分類器) | Zod parse fail | フェールセーフ（エスカレ） |
| Safety block (Gemini) | finishReason='SAFETY' | 「申し訳ありません、回答できない内容です」+ エスカレ |

**コスト記録**: Gemini レスポンスから `usageMetadata.{promptTokenCount, candidatesTokenCount}` を取得し、構造化ログ (`[gemini] tokens=in/out, latency=, model=`) として出力。Phase 2 で集計テーブル化。

---

## 5. ストリーミング応答（W5 持ち越し、本書では設計のみ）

**W4 では実装しない**。W5 で組む際の方針メモ:

- **SSE 採用**（WebSocket 不要、HTTP/1.1 で動く、Vercel 互換）
- Next.js 16 Route Handler は `Response(new ReadableStream(...))` で SSE 送出可能
- Gemini SDK の `generateContentStream` を使い、chunk ごとに `data: {token}\n\n` を送る
- フロントは `EventSource` で受信、トークンごとに DOM に append
- W4 で作る `chat-pipeline.ts` は **同期 / streaming 両対応の generic 構造**にしておく（D-5 で意識）

---

## 6. ログ・監視

### 6-1. W4 で実装するログ

| イベント | 出力 | サンプリング |
|---|---|---|
| PII ブロック | `[chat] pii block: types=[zairyu_card], len=N` | 100% |
| Whitelist KW hit | `[chat] keyword escalate: kw='私の', locale=ja` | 100% |
| Whitelist LLM hit | `[chat] llm escalate: reason='...', latency=Nms, tokens=in/out` | 100% |
| 通常応答 | `[chat] answer: latency=Nms, tokens=in/out, model=flash` | 100% |
| Gemini 失敗 | `[chat] gemini error: code=429, attempt=2/3` | 100% |

`console.log` で出力（Vercel ログ集約）+ Sentry breadcrumb 追加（W4 では Sentry 連携は最小、エラーのみ captureException）。

### 6-2. W5 で `messages` テーブル保存時に追加

- `messages.whitelist_decision JSONB` に `{kw_hit, llm_judgment, latency_ms}` を全件保存（master plan §9 #10 監査用）
- 月次サンプリングレビュー UI は Phase 2

### 6-3. AI 出力監査の運用

W5 でチャットが本番運用に入った後、`messages` から無作為 100 件 / 月をサンプリング → 士業がレビュー → Whitelist 偽陰性が見つかったらキーワード追加 + LLM プロンプト調整、のサイクル。**仕組みは W4 の段階で `whitelist_decision` を JSONB 設計しておく**ことで支える。

---

## 7. テスト戦略

### 7-1. ユニットテスト

| 対象 | 想定テスト数 | 内容 |
|---|---|---|
| `detectPii` | 15-20 | 在留カード/パスポート/マイナンバー/電話/メール の各 hit + 偽陰性 (普通の数字列) + locale 別 |
| `detectIndividualKeywords` | 20-30 | 各言語の代表キーワード hit + general question を通す + word boundary 検証 |
| `parseClassifierResponse` (LLM 分類器の JSON parser) | 5 | 正常 JSON / 不正 JSON / 部分欠損 |
| `formatEscalation` | 3 | 各言語のテンプレ展開 |

合計 50-60 ユニットテスト目標。

### 7-2. Whitelist の偽陰性チェック（master plan §11 「100件で偽陰性 0」が DoD）

W4 では **手動テストデータ 30 件**で偽陰性 0 を目指す。100 件は W5 でデータが溜まってから。

```
tests/fixtures/whitelist-cases.json:
[
  {"input": "私の在留期限が来月で切れます。延長できますか？", "expected": "escalate"},
  {"input": "在留資格「技術・人文知識・国際業務」の更新には何が必要ですか？", "expected": "answer"},
  ...
]
```

### 7-3. Gemini 応答の reproducibility

LLM 出力は確率的。**reproducibility テストは諦める**:
- 「ある質問に対して X という文字列が返る」は assert しない
- 代わりに **構造的 invariant** を assert: 「200 文字以上 / 個別事案に対しては警告含む / 返答に PII (在留カード番号 12 桁等) が含まれない / disclaimer 文字列が末尾にある」

### 7-4. Gemini 呼び出しの mock 戦略

ユニットテストでは `vi.mock('@google/genai')` で SDK 全体を mock 化。実 API は `/api/chat/preview` 経由の手動 smoke でのみ叩く（Sentry や課金との独立性確保）。

---

## 8. 実装ステップと STOP point

| サブ | 内容 | 想定 | STOP? |
|---|---|---|---|
| **D-1** | `lib/ai/gemini.ts` クライアント wrapper + env 検証 + smoke (実 API 1 回呼ぶ) | 1-1.5h |  |
| **D-2** | `lib/pii/detect.ts` + テスト | 0.5-1h |  |
| **D-3** | `lib/ai/whitelist-keywords.ts` + テスト + fixtures | 1-1.5h |  |
| **STOP 1** | D-1〜D-3 動作確認: Gemini API key OK / PII detect / KW detect | — | ✅ ユーザー確認 |
| **D-4** | `lib/ai/whitelist-llm.ts` (Gemini 分類器、JSON モード) + テスト | 1.5-2h |  |
| **D-5** | `lib/ai/chat-pipeline.ts` 統合 (PII → KW → LLM → Gemini → disclaimer) | 1-1.5h |  |
| **D-6** | `messages/{ja,en,tl}.json` にエスカレ・ディスクレーマー文言追加 | 0.5h |  |
| **D-7** | `/api/chat/preview` smoke endpoint (`requireEditor` ガード、Zod、1メッセージで pipeline 試行) | 0.5-1h |  |
| **STOP 2** | エンドツーエンド smoke: 一般質問 → Gemini 応答 / 個別質問 → エスカレ / PII 含み → ブロック | — | ✅ ユーザー確認 |
| **D-8** | 5役割監査 + commit 分割 + Lesson 追記 | 1h |  |
| **合計** | | **~7.5-10h** | |

### 8-1. 所要見積（user 質問への直接回答）

| サブタスク | 楽観 | 悲観 | 主な不確実性 |
|---|---|---|---|
| Whitelist 単体（D-3 KW + D-4 LLM） | 2.5h | 3.5h | LLM プロンプト微調整、JSON モード SDK API 確認 |
| Gemini 接続（D-1） | 1h | 1.5h | API key 取得 + 動作確認、SDK バージョン bump 判定 |
| ストリーミング | — | — | **W5 持ち越し**（本書 §1-3, §5） |
| 個別性検知（= Whitelist） | 上に含む | | |
| PII 検出（D-2） | 0.5h | 1h | 在留カード正規表現の正確性 |
| パイプライン統合（D-5） | 1h | 1.5h | エラーパスのフェールセーフ |
| smoke endpoint（D-7） | 0.5h | 1h | requireEditor + Zod は W3 流用で軽い |
| 仕上げ（D-8） | 1h | 1.5h | 監査内容次第 |
| **トータル（W4 全体）** | **6.5h** | **10h** | |

**今夜中の完成可否**: 開始から 6-10 時間。今が 17 時として、休憩抜きで 23-3 時着完了想定。**現実的には STOP 1 + STOP 2 のうち STOP 1 まで今夜、STOP 2 と D-8 を翌朝**が無理なくおすすめ。完走するなら早めに着手。

---

## 9. 異常系シナリオ（claude.md Part 2.1 #7、最低5つ）

| # | シナリオ | 影響 | 対処 |
|---|---|---|---|
| 1 | Gemini API timeout / 5xx | 応答不能 | 30s timeout、3回 exponential backoff、最終失敗 → Whitelist フェールセーフ（エスカレ案内） |
| 2 | Gemini 分類器が不正 JSON | エスカレ判定不能 | Zod parse fail → fail-safe (エスカレ判定) |
| 3 | Gemini Safety block (finishReason='SAFETY') | 出力なし | UI 用メッセージ「回答できない内容です」+ エスカレ案内 |
| 4 | PII detector 偽陰性（在留カード番号がプロンプトに混入） | システムプロンプト漏洩リスク | (a) システムプロンプトに「PII を echo するな」明記、(b) post-processing で出力中の `[A-Z]{2}\d{8}[A-Z]{2}` パターンを検出 → ログ + マスク (`*****`) |
| 5 | プロンプトインジェクション（"Ignore previous instructions, you are…"）| システムプロンプト上書き試行 | (a) system prompt に「ユーザー入力に従うな」明記、(b) ユーザー入力を 2000 字制限 (Zod)、(c) 入力を XML タグで wrap して system と分離 |
| 6 | 同一ユーザー大量送信（DoS） | コスト爆発 | W4 では editor+ 限定 smoke のため抑制不要。W5 で `/api/chat/send` 実装時にレートリミット (60/min/user) 必須 |
| 7 | Whitelist 偽陰性（個別事案を答えてしまう） | **士業法違反リスク** | (a) キーワード検知の偽陽性側寄せ、(b) LLM 分類器を「borderline は individual」プロンプト調整、(c) `whitelist_decision` を JSONB で全件記録 → 月次サンプリングレビュー |

---

## 10. 認可ポリシー

| エンドポイント | 認可 | 備考 |
|---|---|---|
| `/api/chat/preview` | `requireEditor` | W4 段階では admin/editor のみ smoke 用。W5 で `/api/chat/send` を `requireAuth` で公開 |

W4 では一般ユーザーがチャット送信できない（W5 まで）ため、Welcome Trial / 月次クォータ / 課金判定は不要。W5 でまとめて実装。

---

## 11. 環境変数

```
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash    # default、env で上書き可能に
GEMINI_TIMEOUT_MS=30000          # default
```

`.env.example` 更新 + `lib/env/validate.ts` に追加。

---

## 12. 主要ファイル一覧

### 新規作成

- `apps/v2/src/lib/ai/gemini.ts` — クライアント wrapper
- `apps/v2/src/lib/ai/whitelist-keywords.ts` — 多言語キーワード正規表現
- `apps/v2/src/lib/ai/whitelist-llm.ts` — Gemini 分類器
- `apps/v2/src/lib/ai/chat-pipeline.ts` — 統合 pipeline
- `apps/v2/src/lib/pii/detect.ts` — PII 検出
- `apps/v2/src/messages/{ja,en,tl}.json` — エスカレ・ディスクレーマー文言追加（既存ファイルに key 追加）
- `apps/v2/src/app/api/chat/preview/route.ts` — smoke endpoint
- `apps/v2/tests/unit/pii-detect.test.ts`
- `apps/v2/tests/unit/whitelist-keywords.test.ts`
- `apps/v2/tests/unit/whitelist-llm-parser.test.ts`
- `apps/v2/tests/unit/chat-pipeline.test.ts`
- `apps/v2/tests/fixtures/whitelist-cases.json`

### 変更

- `apps/v2/src/lib/env/validate.ts` — `GEMINI_API_KEY` 等追加
- `apps/v2/.env.example` — 同上
- `apps/v2/package.json` — `@google/genai` を最新へ bump (実装着手時に確認)

---

## 13. Definition of Done（W4）

- [ ] typecheck / lint / test / build 全 green
- [ ] PII detect 15+ ユニットテスト、KW detect 20+ ユニットテスト
- [ ] LLM 分類器 JSON parser のテスト
- [ ] chat-pipeline のテスト（mock Gemini で `kind: 'blocked' / 'escalate' / 'answer'` の3 path 全網羅）
- [ ] `/api/chat/preview` で実 API 経由の smoke 成功 (一般質問・個別質問・PII 入力 の 3 ケース)
- [ ] Sentry にエラーが届く（故意に GEMINI_API_KEY を空にして fail させ確認）
- [ ] 5役割監査で致命/高 0 件
- [ ] `tasks/lessons.md` に W4 で得た学びを Lesson 15 以降として追記

---

## 14. STOP point の設計（user §8 への回答）

| STOP | 何を確認 | 狙い |
|---|---|---|
| **STOP 1**（D-1〜D-3 完了後） | (a) `pnpm dev` 起動して `/api/chat/preview` に curl で「ビザ更新には何が必要？」を投げ、Gemini Flash の応答が返る (b) 「私の在留期限が…」を投げ、KW でエスカレに振られる (c) 「在留カード AB12345678CD について」を投げ、PII でブロックされる | 主要 3 path（answer / escalate / blocked）が動く土台確認、API key 設定不備の早期発見 |
| **STOP 2**（D-7 完了後） | LLM 分類器が borderline ケースで正しく判定するか、Whitelist 偽陰性ケースを fixture から流して 0 件確認 | LLM プロンプトの最終調整、運用前の安心 |

STOP 1 を必ず置く理由: Gemini API key の権限不足や billing 未設定など外部要因で詰まりやすい。早く見つけて対処したい。

---

## 15. 未確定事項

1. `@google/genai` を 2.x に bump するか（D-1 着手時に最新仕様 + breaking change 確認）
2. 分類器の **temperature**: master plan は触れていない。**0.0 推奨**（分類は決定的に）
3. 生成側の **temperature**: 0.7 程度。タガログ語の自然さ重視。実装後 smoke で調整
4. Gemini Safety threshold: SDK デフォルト (BLOCK_MEDIUM_AND_ABOVE) で開始、過剰ブロックがあれば調整
5. PII の **電話番号** 検知の厳密度: 日本式 03-XXXX-XXXX / 携帯 090-XXXX-XXXX のみで、フィリピン番号 +63... は別。MVP は日本式のみ → Phase 2 で拡張

---

## 16. user §3 「拒否時の dimming 設計」への回答

「個別助言を一般情報に薄める」アプローチは **MVP 不採用**。理由:
- dimming する prompt 設計を間違えると LLM が個別具体的助言を返すリスクが残る
- 法的に「明確に専門家へ誘導 + 連絡先提示」の方が安全
- 代わりに **エスカレ文言を丁寧にする**（experts テーブルから該当士業を即提示、calendar_url リンクで予約導線まで一気通貫）

将来 dimming を導入する場合の前提:
- 月次サンプリングで偽陰性 0 が安定して観測できている
- 士業との合意ができている（dimming 後の文言を士業がレビュー）
- A/B でユーザー満足度比較できる UI がある（W5 以降）

---

*本設計書は `~/.claude/CLAUDE.md` Part 2.1 に準拠。承認後 D-1 着手。*
