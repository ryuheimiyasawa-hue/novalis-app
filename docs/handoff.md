# Novalis App 開発 — 新セッション引継ぎ

_最終更新: 2026-06-30 / Phase 2 M0+M1 大半を実装・本番反映した直後_

新しい Claude チャットを開始したら、まず本ファイルを読んでから作業に入ること。
Phase 2 の実行計画と各項目の状態は `docs/phase2-masterplan.md` が正本。

---

## 0. Phase 2 進捗スナップショット（2026-06-30）

ここから下の §1〜§8 は 2026-05 デモ期の記録（依然有効な基本情報）。本セクションが最新の到達点。

### 開発ワークフロー（重要・5月から変更あり）

- **main はブランチ保護下**。直 push 不可。変更は feature ブランチ → PR → CI（`quality` チェック必須）→ merge。merge で Vercel 本番自動デプロイ。
- CI: `.github/workflows/ci.yml`（lint / typecheck / test / build をブロッキング、`pnpm audit --prod --audit-level high` もブロッキング）。
- マイグレーションは Supabase MCP の `apply_migration` で適用＝履歴テーブルに記録される（手動 SQL Editor 運用は卒業）。`list_migrations` で確認可。
- 検証体制: ユニットテスト（DBモック、現在 409 件）＋ RLS は MCP `execute_sql` でロールバック安全に実機検証（`supabase/tests/rls.test.sql` 相当）＋ Vercel プレビュー。**有料テスト DB は不採用**（Pro プランで +$10/月、費用対効果が低い）。ライブ DB の Playwright E2E は保留。

### 本番反映済み（このフェーズで完了、すべて merge 済み PR）

- **P0-A** セキュリティ恒久化（`008_security_hardening.sql`）: 未適用だった 007 anon-hardening を再適用（匿名ユーザの profiles 改ざん・inquiries/consent_logs 汚染を封鎖）、SECURITY DEFINER 3 関数の EXECUTE を PUBLIC/anon/authenticated から REVOKE（service_role 維持）、4 関数に `SET search_path=''`。advisor の該当 WARN 解消。
- **P0-C** 認証ハードニング: 最小パスワード長 6→8、漏洩パスワード保護 ON（Dashboard）、匿名ユーザ purge CLI（`pnpm purge:anon`、保持 `ANON_RETENTION_HOURS` 既定 72h、dry-run 既定）。
- **P1-D** PII 安全 Sentry ＋ persist 失敗アラート: `lib/sentry/scrub.ts` の beforeSend で全イベントの PII をマスク、chat/send の persist 失敗を `Sentry.captureException`＋構造化ログ化（Lesson 25 対策）、`app/global-error.tsx`。**SENTRY_DSN 未設定なら no-op**（本番 env に DSN 設定で起動 = ユーザ作業待ち）。
- **P1-E** Next.js 16.2.2→16.2.9（proxy bypass 等 high 解消）＋ `@google/genai` 配下の間接 high を pnpm overrides で解消（ws/protobufjs/hono）＋ CI audit をブロッキング化。
- **P1-F** エスカレ判断の監査証跡: `messages.whitelist_decision` を実保存（`lib/ai/whitelist-decision.ts`、route で配線）。escalationScore は決定論的暫定値。escalation 用 env を scaffold（既定 OFF）。
- **P1-G** CI 品質ゲート ＋ ブランチ保護。
- **P1-I** admin の記事/FAQ mutation で自動 reindex（silent staleness 解消）＋ 多言語 RAG（en/tl の本文がある時に各ロケールで embed。現状コンテンツは ja のみなので翻訳投入で有効化）。
- **P2-L 改善2** エスカレ「それでも質問を続ける」ボタン＋再表示 cooldown。`NEXT_PUBLIC_ESCALATION_SHOW_CONTINUE_BUTTON` 既定 OFF（弁護士回答＋対話 UX 検証まで OFF 維持）。

### 保留・繰り延べ（理由付き）

- **P0-B** Supabase CLI 全面移行: MCP で履歴記録が機能しているため優先度低下。001-007 の baseline 登録と連番/タイムスタンプ命名の整合は CI 拡張時に対応。
- **P1-H** ライブ DB の E2E/統合の CI 化: 無料で組むには CI 内 Supabase スタックが必要で重く、費用対効果が低いため保留。RLS は MCP 実機検証で代替。
- **P1-D の UX 系**（ローカライズ `[locale]/error|loading|not-found`、構造化ログ全面移行）、**Gemini コスト監視**（Sentry DSN 設定後に組）。
- escalation graded score の LLM 出力化（P2-L 改善1 の前提、ライブ Gemini 検証要）。

### ユーザ作業待ち（任意・少量）

- **Sentry DSN**: sentry.io で Next.js プロジェクト作成 → Vercel 本番 env に `SENTRY_DSN` ＋ `NEXT_PUBLIC_SENTRY_DSN` 設定で P1-D 起動。
- **監査証跡の即時確認**: ログイン状態の本番でチャット 1 通送れば `whitelist_decision` 書き込みを MCP で確認可能（デプロイ後まだ新規チャットが無く 0 件）。

### 次セッションの着手候補（M2、多くが外部依存）

飲食店カタログ（掲載店データ待ち）/ 専門家 embedding マッチング（協業企業データ待ち）/ エスカレ改善1・4（弁護士回答待ち）/ Messenger（FB 公開モード移行待ち）/ operator 介入 UI（自律可、UI 検証は手動）/ 問い合わせ first-party 化。

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

### 推奨着手順（次セッションで再確認）

1. **REVOKE SQL 実行**（Phase 2 着手前の security fix、§6 参照）
2. Phase 2 から **1〜2件選定** → feature ブランチで着手。候補:
   - **候補A**: Komoju 課金（旧 W6）— 大規模、課金フロー全体設計が要、`NEXT_PUBLIC_PAYMENT_ENABLED` フラグ flip と一緒
   - **候補B**: Messenger 対応（旧 W7）— Facebook 公開モード移行とセット、`MESSENGER_*` env 既リザーブ
   - **候補C**: 会話タイトル AI 自動生成 — 小規模（1 日）、ユーザ体感即効性高
   - **候補D**: Sentry 本格稼働 + persist 失敗 alert — 運用品質向上、本番稼働直後にやる価値高い
   - **候補E**: オペレーター介入 UI（旧 W6 の半分）— `operator_takeover_logs` 既存活用、管理画面拡張
3. C と D は小タスク、A/B/E の大型機能の合間に組み込み可能

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
