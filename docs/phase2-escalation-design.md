# Phase 2 Escalation Policy 設計

_作成: 2026-05-27 / lawyer review 待ち、実装は弁護士回答後着手_

本ドキュメントは Novalis Phase 1 (2026-05-14 ship) で稼働中の escalation ロジックを Phase 2 で精緻化するための設計書である。実装着手は `docs/lawyer-review-questions.md` の弁護士回答受領後に行う。

---

## 1. 背景

Phase 1 の運用方針 (memory: project_filipino_chat_conversational_policy)。AI は会話継続が default、escalation は「具体的事実 + 専門家判断必須」の両方が揃ったときの最終手段。デモ期間中の挙動を観察し、以下 4 つの改善余地が明らかになった。

第 1。escalation 判定が単一メッセージのみで行われており、会話の累積文脈が考慮されていない。同じ案件について 3 ターン議論した後に escalation 要件を満たすケースで、過去ターンの情報が反映されていない。

第 2。escalation 表示後にユーザが「やはり質問を続けたい」と思っても、明示的な UI 動線がない。EscalationCard が表示されるとそのまま会話が終わるかのような印象を与える。

第 3。専門家マッチングが現状ランダム or 単純カテゴリマッチ。在留資格専門の行政書士、家族法専門の弁護士、といったテーマ別精度が出ていない。

第 4。PII 検出は「検出したら送信ブロック」のみで、マスクして処理続行という選択肢がない。ユーザは個人情報を全削除した文章を再入力する必要があり、UX が悪い。

---

## 2. 改善 1: Escalation スコアリング

### 2.1 仕様

現状の単一判定を直近 N ターンの累積スコア判定に変更する。N の初期値は 5。

各メッセージに対して classifier が 0.0-1.0 のスコアを返す。最新メッセージのスコアを 1.0 倍、1 ターン前を 0.6 倍、2 ターン前を 0.36 倍、と等比減衰 (係数 0.6) で重みづけ。累積合計が閾値 (初期値 1.5) を超えたら escalation 発動。

閾値と減衰係数は環境変数で外部化し、運用中に調整可能にする。

### 2.2 データモデル

**訂正 (2026-06-25 / P1-F 実装時)**: 旧版は「classifier スコアを Phase 1 で先行実装済 (`messages.whitelist_decision.score`)」と記載していたが、これは事実誤認だった。Phase 1 の classifier (`whitelist-llm.ts`) は category enum と reason のみを返し、`whitelist_decision` 自体が route handler から渡されず常に null 保存だった (監査証跡ゼロ)。

P1-F で次を実装済み:
- `messages.whitelist_decision` の保存を実配線 (route.ts → persistResult)。保存形は `{ stage, outcome, category, reason, escalationScore, failsafe }` (`lib/ai/whitelist-decision.ts`)。
- `escalationScore` は当面 **決定論的な暫定シグナル** (escalation トリガなら 1.0、それ以外 0.0)。LLM が出す graded な 0.0-1.0 信頼度ではない。

本節の累積スコアリングが必要とする graded score は、高度にチューニングされた Stage2 classifier のプロンプト/出力スキーマ変更を伴い、ライブ Gemini での較正検証が必須。よって **graded score 化は P2-L (フラグ `ESCALATION_USE_CUMULATIVE_SCORE` + メトリクス観察とセット) に繰り延べ**。新規カラム追加は不要 (既存 JSONB を使用)。

累積判定は過去 N ターンの `whitelist_decision.escalationScore` を JOIN して計算する。スコア未格納の古いメッセージ (P1-F 以前) は 0.0 として扱う。

### 2.3 API 契約

`/api/chat/send` route handler 内、classifier 呼び出し後に追加。

```
processChatStream({
  message,
  history,           // 直近 10 turns (既存)
  cumulativeScore,   // 新規: 直近 N ターンの累積 escalation スコア
  threshold,         // 新規: 環境変数から
})
```

classifier の返却に `escalation_score: number` を追加 (現状 boolean `escalation: true|false` を numeric に格上げ)。

### 2.4 認可

変更なし。既存の requireAuth + chat_usage quota チェックを継承。

### 2.5 異常系

(1) classifier がスコアを返さなかった (legacy code path) 場合、boolean を fallback として 0 or 1 に変換。
(2) 環境変数未設定時は閾値 1.5 / 減衰 0.6 のデフォルトを使用。
(3) 過去メッセージのスコア取得 SQL が失敗した場合、最新メッセージのスコアのみで判定 (Phase 1 と等価な fallback)。
(4) スコアが NaN / Infinity になった場合、escalation 発動側に倒す (安全側 default)。
(5) anonymous user の累積判定は他 user の会話とは完全に分離 (conversations.user_id 一致条件で SQL を絞る)。

### 2.6 テスト方針

unit テスト。スコアリング関数 `cumulativeEscalationScore(scores: number[], decay: number): number` を純粋関数として切り出し、エッジケース (空配列、全 0、全 1、減衰係数 0 と 1) を検証。

integration テスト。`/api/chat/send` route handler のモックで、5 ターンの履歴 + 新規メッセージで累積スコアが閾値を跨ぐシナリオを検証。

### 2.7 完了基準

unit + integration テスト pass。新規環境変数 `ESCALATION_SCORE_THRESHOLD` および `ESCALATION_SCORE_DECAY` を env validator (`apps/v2/src/lib/env/validate.ts`) に追加。`docs/handoff.md` の Phase 2 完了済リストに追記。

### 2.8 未確定事項

閾値 1.5 / 減衰 0.6 はユーザの実会話データを見て調整する必要あり。Phase 2 着手前に `/admin/metrics` で escalation 発動数を 2 週間観察し、その実測値から逆算するのが筋。

---

## 3. 改善 2: Escalation 後の Continue 動線

### 3.1 仕様

EscalationCard 表示後、カード下部に「それでも質問を続ける」というセカンダリボタンを追加。クリックでカードを minimize 表示にし、入力欄を再アクティブ化する。

minimize 後はカード上部のみ残し、専門家リストは折りたたみ。ユーザが続行した場合も「専門家相談を推奨」のラベルは残し続ける。

### 3.2 データモデル

新規カラム追加なし。クライアント側 state のみ。

サーバ側に「ユーザが continue を選択した」イベントを `messages.whitelist_decision.user_continued: true` として記録するのは Phase 2.5 で検討。Phase 2 段階ではクライアント state のみで完結。

### 3.3 API 契約

変更なし。

### 3.4 認可

変更なし。

### 3.5 異常系

(1) Continue ボタン押下後の次メッセージで再度 escalation 発動する可能性。これは意図通り (escalation 要件を満たし続ける限り表示)、ただし重複感を減らすため「前回 escalation から 3 ターン以内は EscalationCard を非表示にする」cooldown ルールを追加。
(2) ページ reload で continue 状態が消える。client state なので意図通り。気になる場合は localStorage に conversation_id 単位で保存する選択肢あり。

### 3.6 テスト方針

E2E (Playwright) で EscalationCard 表示 → Continue クリック → 入力可能になることを検証。

### 3.7 完了基準

EscalationCard コンポーネント (`apps/v2/src/components/chat/EscalationCard.tsx`) に continue ボタン追加。Cooldown ロジックを ChatShell に追加。E2E テスト pass。

---

## 4. 改善 3: 専門家マッチング精度向上

### 4.1 仕様

現状の experts.category_id ベースマッチングを embedding ベースに移行。ユーザの直近メッセージ (escalation 発動メッセージ) を Gemini で embedding 化し、experts テーブルに事前計算された embedding との cosine similarity 上位 3 件を表示。

### 4.2 データモデル

`experts` テーブルに `bio_embedding VECTOR(768)` カラム追加。`bio` (TEXT) を embedding 化して格納。新規 expert 追加時に admin CMS で自動 embedding 化 (記事と同じパターン)。

### 4.3 API 契約

experts 取得処理 (現状 `apps/v2/src/lib/experts/find.ts` 想定) を embedding 検索に置換。

```
findExpertsForMessage(message: string, locale: string, limit = 3): Promise<Expert[]>
```

内部で Gemini embedding → match_experts RPC (新規) → JOIN experts → 上位 limit 件返却。

### 4.4 認可

experts は public read。embedding 検索は admin client 経由 (`match_content` RPC と同パターンで REVOKE 済の前提)。

### 4.5 異常系

(1) embedding 生成が timeout。Phase 1 の rag.ts と同じく try/catch で握り、fallback として category_id ベース検索に degrade。
(2) match_experts RPC がエラー。同上 fallback。
(3) 全 experts に embedding がまだ計算されていない (migration 適用直後)。空配列を返し EscalationCard 側で「現在ご紹介できる専門家がいません」表示 (既存ロジック流用)。

### 4.6 テスト方針

unit テスト。findExpertsForMessage のモック化、fallback path 検証。

integration テスト。実 embedding を含む test fixture の experts 数件で類似度検索が期待通り動くか検証 (Supabase test DB 必須)。

### 4.7 完了基準

`apps/v2/supabase/migrations/008_expert_embedding.sql` 作成 (column 追加 + match_experts RPC + REVOKE)。再 indexing スクリプト (`apps/v2/scripts/reindex-experts.ts`) 実行。admin CMS で expert 追加 / 編集時に embedding 自動更新。

### 4.8 未確定事項

experts 数が現状ゼロ (handoff §6 参照)。協業企業 5 社打診の進捗次第で実装着手タイミングが決まる。

---

## 5. 改善 4: PII Mask & Continue

### 5.1 仕様

現状の「PII 検出 → 送信完全ブロック」を、「検出箇所をマスクして送信続行」オプションに変更。ユーザに「個人情報を伏字に置き換えて続けますか?」と確認モーダルを表示、Yes でマスク後の文章を AI に送信。

マスク方法は検出種別ごとに固定文字列に置換。在留カード番号 → `[在留カード番号]`、電話番号 → `[電話番号]`、メール → `[メールアドレス]` など。

### 5.2 データモデル

新規カラム追加なし。`messages.whitelist_decision.pii_masked: true` を追加して監査可能にする。

### 5.3 API 契約

`/api/chat/send` の入力に `pii_handling: "block" | "mask"` を追加。"mask" の場合、送信前にマスク変換 (サーバ側) して LLM に投入。content カラムにはマスク後の文章を保存。

オリジナル (マスク前) の文章は DB に保存しない (個人情報を DB に残さない方針)。

### 5.4 認可

変更なし。

### 5.5 異常系

(1) マスクで意味が変わってしまうケース (例: 電話番号を伏字化したら問い合わせ意図が消失)。AI 側で「個人情報を伏字に置き換えたため、文脈が読み取れない場合があります」と冒頭 disclaimer を付与。
(2) マスク漏れ (PII detector 検出ミス)。これは Phase 1 と同じリスクで、Phase 2 で raise しない (別タスクで PII detector 精度改善)。
(3) anon user による意図的な無意味な PII 投入 (荒らし)。chat_usage quota で抑制。

### 5.6 テスト方針

unit テスト。マスク変換関数 `maskPii(text: string, detections: PiiDetection[]): string` の純粋関数化と検証。

integration テスト。/api/chat/send route で pii_handling: "mask" 指定時に DB に保存される content がマスク済であることを検証。

### 5.7 完了基準

UI 側で「個人情報を伏字に置き換えて続ける」モーダル実装。サーバ側マスク変換実装。テスト pass。`messages.whitelist_decision.pii_masked` で監査可能。

### 5.8 未確定事項

弁護士監修事項 (`docs/lawyer-review-questions.md` §6-1 PII Mask の許容範囲) の回答が必要。マスクで足りない領域があれば設計修正。

---

## 6. 実装順序とコミット単位

弁護士回答受領後、以下の順で実装する。各単位で 1 PR、CI / レビュー前提 (Phase 2 は feature ブランチ運用、handoff §4 git workflow に従う)。

第 1。Escalation スコアリング (改善 1)。バックエンド単独完結、UI 変更なし。先にメトリクス取得を続けて閾値を実測決定。

第 2。Escalation Continue 動線 (改善 2)。フロントエンド単独完結、API 変更なし。UX 改善として即効性高い。

第 3。PII Mask & Continue (改善 4)。フロントエンド + バックエンド両方、API 拡張あり。弁護士回答の影響を最も受けるので回答待ちタイミングで投入。

第 4。専門家マッチング (改善 3)。experts データが実投入される協業フェーズと連動。embedding migration + reindex スクリプトが必要。最大規模。

---

## 7. 監視 / ロールバック計画

各改善はそれぞれ環境変数フラグで ON / OFF 切替可能とする。

- 改善 1: `ESCALATION_USE_CUMULATIVE_SCORE` (default false)
- 改善 2: `ESCALATION_SHOW_CONTINUE_BUTTON` (default false)
- 改善 3: `EXPERTS_USE_EMBEDDING_MATCH` (default false)
- 改善 4: `PII_ALLOW_MASK_CONTINUE` (default false)

本番展開時は段階的に true 化。各 ON 後 1 週間は `/admin/metrics` で escalation / message counts の異常変動を監視する。

ロールバックは環境変数を false に戻すだけで即時可能。DB migration が必要な改善 (3 のみ) は column 追加のみで既存 schema との互換性あり、戻すときは migration を残したまま機能 OFF で問題なし。

---

## 8. 未確定事項一覧

(1) 各環境変数の本番初期値 — 実測データを見て決定。

(2) 改善 4 のマスク方法詳細 — 弁護士回答待ち。

(3) 改善 3 の embedding 次元数 — Gemini text-embedding-004 = 768 dim を想定だが、最新 model 確認要。

(4) 改善 1 の閾値 1.5 / 減衰 0.6 — 暫定値、Phase 2 着手前のメトリクス観察で確定。

(5) Phase 2 全体の所要工数 — 改善 1 = 3 日、改善 2 = 2 日、改善 3 = 2 週間 (協業データ連動)、改善 4 = 5 日。合計 1 ヶ月強 (フルタイム換算)。
