# Novalis App 開発 — 新セッション引継ぎ

_最終更新: 2026-05-18 / デモ準備完了直後のスナップショット_

新しい Claude チャットを開始したら、まず本ファイルを読んでから作業に入ること。

---

## 1. プロジェクト基本情報

- **プロダクト名**: Novalis（在日フィリピン人向け生活支援アプリ）
- **本番 URL**: https://novalis-app.vercel.app
- **GitHub**: https://github.com/ryuheimiyasawa-hue/novalis-app
- **ローカル**: `~/開発/フィリピン人サポート/apps/v2/`
- **Supabase project ID**: `vawreuciwcdittxgdilc`（region: ap-northeast-1）
- **Vercel project**: Root Directory = `apps/v2`、main ブランチ auto-deploy
- **デプロイ完了日**: 2026-05-17
- **デモ予定**: 2026-05-20 以降

## 2. スタック

- **Frontend**: Next.js 15 (App Router、Turbopack)、React、Tailwind、shadcn/ui
- **i18n**: next-intl（ja / en / tl 3言語、`/[locale]/` ルーティング）
- **Backend**: Next.js API routes、SSR、Server Components
- **DB**: Supabase Postgres + RLS + pgvector
- **Auth**: Supabase Auth + Facebook OAuth（App ID: 1685408235805089、現在「開発中」モード）
- **AI**: Google Gemini 2.5 Flash（billing 有効、月¥3,000 アラート）
- **Contact**: Google Form 埋め込み（`NEXT_PUBLIC_CONTACT_FORM_URL` env）
- **Monitoring**: Sentry SDK 導入済だが env optional（未稼働、Phase 2 で本格化予定）

## 3. デモ準備までに実装済の機能

### Phase 1 会話設計（commits `baba4f8` / `42dea3e` / `1587e51`）

- Stage1 keyword whitelist 厳格化（bare 人称 / 時間マーカー削除、高精度 trigger のみ残留）
- Stage2 LLM classifier（Gemini）の prompt 全面リライト + thinkingBudget=256、ABSOLUTE OVERRIDES + few-shot で「困った」「相談」等の単独 trigger を `general` に倒す
- smalltalk を canned text → Gemini 会話応答に置換（失敗時 canned fallback）
- 曖昧な質問に対し answer system prompt が 1 question で聞き返す rule#8

### MVP 5機能 + Sidebar UI

- **A** (`dd15c2e`): 文脈継承（直近 10 turns を classifier + smalltalk + answer の3 LLM 呼び出し全てに渡す）
- **B** (`121177b` → `a4e3418` で sidebar 化): 過去会話 sidebar UI（desktop = 左 260px、mobile = ハンバーガー drawer 自作）+ ChatShell の URL からの履歴復元
- **C** (`64da6fa`): 公開記事一覧 `/[locale]/articles`（ISR 10min、ページネーション、dashboard CTA）
- **D** (`f1d3052`): 記事に YouTube/Vimeo 動画埋め込み（migration 006 で `articles.video_url` + `video_provider` 追加、CHECK 制約 + iframe レンダ）
- **E** (`11e791b`): `/[locale]/contact` ページ（Google Form iframe）+ EscalationCard に contact ボタン

### その他のポリッシュ

- `24f9675`: 「Novalis サポート窓口（準備中）」placeholder expert 削除、experts.length === 0 のとき CardHeader 非表示、escalation 本文を experts 非依存に
- `1a15f35`: proxy.ts に `/contact` を public allowlist 追加（誰でも問い合わせ可能）
- `6a08d98`: env validator で Sentry vars を optional 化、`NEXT_PUBLIC_CONTACT_FORM_URL` 登録

### ドキュメント

- `docs/manual-tl.md`: ベータ配布用 Tagalog ユーザマニュアル（スクショプレースホルダ付き）
- `docs/demo-checklist.tsv`: デモ動作確認用 TSV（67項目、14カテゴリ、Google Sheets 化済）
- `tasks/vercel-deploy-checklist.md`: Vercel デプロイ hardening チェックリスト
- `tasks/lessons.md`: Lesson 17-25 蓄積（特に 23/24/25 は本セッション追加）

## 4. 開発ルール・好み（過去のフィードバックで確立）

`~/.claude/CLAUDE.md`（グローバル）+ プロジェクト直下 `CLAUDE.md` + `AGENTS.md` を必ず読むこと。加えて以下が累積:

- **Novalis 文書スタイル**: 表禁止、太字最小、プレーンプロース（CLAUDE.md Part 3 準拠）
- **労いの言葉禁止**: お疲れ様 / 休んで / 一区切り / good stopping point 等の不要な気遣い言葉は出さない。ペース管理はユーザ側
- **会話設計の philosophy**: AI で会話継続が default、escalation は最終手段（具体的事実 + 専門家判断必須、両方揃ったときのみ）
- **migration 規律**: SQL Editor 適用後は必ず `information_schema` で verify SELECT（Lesson 24）。Phase 2 で Supabase CLI 運用に移行予定
- **persistence エラー監視**: catch + log のみは silent fail を生む（Lesson 25）、Sentry 導入時に必ず error 送信を組み込む
- **Gemini billing**: Free tier RPD 20 で開発の濃い日は枯渇する。本番運用に入ったので注意（Lesson 23）
- **git workflow**: main = production（Vercel auto-deploy）、feat/ ブランチで Phase 2、PR で Vercel preview URL 生成 → main merge → 本番
- **git add 注意**: monorepo + 部分 untracked 構成では `git add -A` / `git add .` 禁止、明示パス指定（Lesson 21）
- **DDL 承認ゲート**: production DB への ALTER / DELETE は SQL Editor でユーザ実行（Claude が apply_migration MCP を直接実行しない）

## 5. Phase / W スコープ整理

W ナンバリングは Phase 1 内のスプリント単位として元計画に存在したもの。MVP A-E 拡張で Phase 1 が前倒し完了したため、W6+ は元計画通りには進まず一部 Phase 2 に統合された。**コード内 `W6` / `W7` コメントは下記元定義を指す**ので次セッションで参照する場合は注意。

### 完了済（Phase 1）

- **W2**: 認証 (Facebook OAuth via Supabase Auth) + onboarding + consent log
- **W3**: admin CMS (articles / faqs / experts / categories) + ISR + `revalidate-content` ヘルパ
- **W4**: chat-pipeline 基盤 — PII detection + Stage1 keyword + Stage2 LLM classifier + smoke endpoint
- **W5**: RAG (pgvector + match_content RPC) + 本番チャット SSE + persistence + quota
- **段階1**: 会話設計 polish（commits `baba4f8` / `42dea3e` / `1587e51`）
- **MVP A-E + Sidebar**: 文脈継承 / 過去会話 UI / 記事一覧 / 動画埋め込み / 問い合わせ
- **デプロイ**: Vercel + Supabase production 2026-05-17

### 元 W 計画の W6+ 定義（コード内コメントの参照元）

`apps/v2/tasks/W5-design.md` §1-2 "含まないもの (W6 以降)" と env validator コメント由来:

- **元 W6** — Komoju 課金（プラン購入導線、checkout、webhook）。`NEXT_PUBLIC_PAYMENT_ENABLED` flag 化済
- **元 W6** — オペレーター介入 UI（chat-pipeline.ts:43 のコメント参照、`conversations.mode='operator'` + `operator_takeover_logs` テーブル既存）。**v3 で Phase 2 送りに変更**
- **元 W7** — Facebook Messenger Bot 連携（env validator の `MESSENGER_*` 三点リザーブ済）。**v3 で Phase 2 送りに変更**
- **元 W8** — 飲食店カタログ（`restaurants` テーブル既存 / 行 0）。**v3 で Phase 2 送りに変更**
- **元 W9-W10** — ベータテスター期間（`whitelist-keywords.ts` の Tagalog パターン拡張コメント参照）

つまりコード上の "W6 operator UI lands later" / "for Bot from W7" 等の表記は元計画基準。実際には Phase 2 backlog に統合済。

### v3 要件定義 §6 Phase 2 (Phase 1 から 3〜6ヶ月後)

- 社労士・税理士の本格運用、機能2の個別対応強化
- コミュニティ機能（Facebook Group 連携 or 限定的な掲示板）
- 不動産紹介（広告掲載型）
- 通訳予約・書類翻訳

### 本セッション累積で追加された Phase 2 候補

- **メッセンジャー対応**（旧 W7）
- **Komoju 課金**（旧 W6）— 月額 / 3ヶ月 / 6ヶ月 / 12ヶ月プラン
- **オペレーター介入 UI**（旧 W6）— `operator_takeover_logs` 既存テーブル活用
- **飲食店カタログ**（旧 W8）
- **会話タイトル AI 自動生成** — 初回発話を Gemini で 20 字要約して `conversations.title` に保存
- **長会話の要約** — A は直近 10 turns 固定、トークン上限近で古い turn を要約圧縮
- **Sentry 本格稼働** — env 設定 + persist 失敗の error 送信 + PII filter in beforeSend + 起動時 schema assertion（Lesson 25 根本対策）
- **Supabase CLI migration 運用** — `supabase db push` + CI で未適用検知 gate（Lesson 24 根本対策）
- **会話の削除・編集・検索** — sidebar 拡張
- **動画埋め込み拡張** — 案2 (markdown 内カスタム構文) or 案3 (iframe sanitize) への移行
- **問い合わせ first-party 化** — Google Form → inquiries テーブル + admin dashboard
- **月次サンプリングレビュー UI** — `messages.whitelist_decision` JSONB 保存済、レビュー UI 未実装
- **AI 出力の audit batch** — 月次で whitelist 判定の precision/recall 計測
- **function_search_path_mutable × 4 関数** — `SET search_path = ''` 追加（Phase 2 polish）

### 並行で進む人間タスク

- 弁護士監修依頼（利用規約・プラポリ・AI 応答の非弁境界）
- 協業企業5社打診（士業ネットワーク構築、experts テーブルに実 row 追加）
- マニュアル native review（フィリピン人ベータ参加者に `docs/manual-tl.md` レビュー依頼）
- Facebook App 公開モード移行（本番ユーザ獲得前）
- ベータ参加者からのフィードバック収集

### 推奨着手順（2026-05-21 再評価で大幅変更）

**重要な戦略再評価（2026-05-21）**:

Web 側 FB OAuth は元計画では「Messenger Bot 着手時の identity unification を見越して」採用したが、Live 化までに Business Verification + Passkey + ポリシー文書 + Data Use Checkup + App Review の hurdles で **想定の 3 倍の作業量** を消費。さらに in-app browser (LINE/Messenger 内蔵 webview) で OAuth flow が壊れる構造的問題が発覚。一方、本来のコア機能である **Messenger Bot** はフィリピン人ユーザの自然な channel で、FB Page を friend する形式 = OAuth 不要・consent friction 皆無で動く。**Web の OAuth 完成度を磨くより Messenger Bot 着手を早めて元の戦略軌道に戻すべき**との判断。

**新優先順**:

1. **REVOKE SQL 実行**（Phase 2 着手前の security fix、§6 参照）— 据置
2. **Web に email magic link 追加**（1h、Phase-1.5 quick win）— FB OAuth と併存させ、in-app browser ユーザや FB を持たない / 嫌がるユーザに代替経路を提供。Supabase Auth が natively サポート、追加 schema 不要。デモ当日トラブル耐性が大幅向上
3. **Messenger Bot 着手**（最優先 Phase 2、旧 W7）— v3 §3 で本来 PWA + Messenger Bot が 2 軸として位置づけられていた。FB Page を friend する形式で OAuth 不要、PSID で識別、Webhook で受信応答。`MESSENGER_*` env 既リザーブ。フィリピン人ユーザの典型行動 (Messenger でやり取り) にマッチ
4. **Sentry 本格稼働 + persist 失敗 alert**（小規模、運用品質）— Lesson 25 根本対策、本番稼働直後にやる価値高い
5. **会話タイトル AI 自動生成**（1日、UX 即効性）

**Phase 2 大型機能の優先順（5 を超えた後）**:
- **Komoju 課金**（旧 W6）— `NEXT_PUBLIC_PAYMENT_ENABLED` フラグ flip と一緒、フリーミアム解禁
- **オペレーター介入 UI**（旧 W6 の半分）— `operator_takeover_logs` 既存活用
- **Web と Messenger の identity unification** — 同一ユーザがどちらでも履歴を見られる、Phase 2 後半

**従来の旧 W7 ≒ 候補B の格上げ理由**:
- フィリピン人ユーザ（target）は FB Messenger 利用率が極めて高い
- Messenger Bot 経由なら OAuth consent screen 不要 = ベータ参加者の login friction ゼロ
- Web の App Review / 公開モードのハードルから距離を取れる
- FB の API も Messenger Platform の方が成熟している

## 6. 既知の保留事項（本セッションで未完了）

- **REVOKE SQL 未実行**: `increment_chat_usage` / `match_content` / `handle_new_user` の anon/authenticated EXECUTE を REVOKE する SQL は提示済、ユーザレビュー後実行予定。**特に `increment_chat_usage` は DoS 脆弱性（anon key で任意ユーザのクォータ枯渇可能）なので Phase 2 着手前に実行推奨**。詳細は本セッションの会話履歴または `git log` の context 参照
- **Facebook App Domains に novalis-app.vercel.app 未登録**: 実害なし、後日対応
- **Facebook App 公開モード移行**: 本番ユーザ獲得前に実施
- **D 動画埋め込みの本番動作確認**: production 記事に video_url 設定された記事が 0 件、admin で 1 記事に YouTube URL 設定して iframe 動作確認が残課題
- **デモチェックリスト消化**: ブラウザ手動の 67 項目、ユーザ実行中
- **Sentry 未稼働**: env optional 化済、Phase 2 で project 作成 + DSN 設定で起動
- **利用規約・プラポリ**: 暫定文言（弁護士監修待ち）

## 7. 次セッション開始時にやってほしいこと

1. **CLAUDE.md 系を全部読む**: `~/.claude/CLAUDE.md` + `apps/v2/CLAUDE.md` + `AGENTS.md` + `tasks/lessons.md`
2. **memory 確認**: `~/.claude/projects/-Users-ryuhe--------------/memory/MEMORY.md` および参照先の feedback / project ファイル
3. **直近 commit を git log で把握**: `git log --oneline -20` で本セッションまでの流れを確認
4. **Phase 2 着手前にユーザに REVOKE 未実行を確認**: もしまだなら最優先で実行する SQL を提示
5. **ユーザが「Phase 2 のうち X から着手したい」と指示するのを待つ**: 勝手に走らない、優先順はユーザが決める

## 8. コミュニケーションスタイル

- 結論 → なぜ → 具体策 の順
- 工数見積もりは時間（h / min）で具体的に
- 表禁止、プレーン文章で構造化
- DDL や destructive op はユーザ承認ゲート必須（Lesson 24）
- 設計判断は案A/B/C 比較 + Claude Code の推奨を求められたら根拠付きで提示
- 「go」と言われたら走る、それ以外は確認
