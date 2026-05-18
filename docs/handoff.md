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

## 5. Phase 2 開発候補（優先順は次セッションで一緒に再確定）

- **メッセンジャー対応**: Facebook Messenger bot で同じ AI に話せるように
- **Komoju 課金**: 月額/3ヶ月/6ヶ月/12ヶ月プラン、`NEXT_PUBLIC_PAYMENT_ENABLED` フラグ化済
- **会話タイトル AI 自動生成**: 初回ユーザ発話を Gemini で 20 字要約して `conversations.title` に保存
- **長会話の要約**: A は直近 10 turns 固定。トークン制限近づいた会話は古い turn を要約して圧縮
- **Sentry 本格稼働**: env 設定 + persist 失敗の error 送信 + PII filter in beforeSend + 起動時 schema assertion
- **Supabase CLI migration 運用**: `supabase db push` + CI で未適用検知 gate（Lesson 24 根本対策）
- **会話の削除・編集・検索**: sidebar 拡張
- **動画埋め込み拡張**: 案2（markdown 内カスタム構文）or 案3（iframe sanitize）への移行
- **問い合わせ first-party 化**: Google Form → inquiries テーブル + admin dashboard
- **弁護士監修**: 利用規約・プラポリ・AI 応答の非弁境界
- **協業企業5社打診**: 士業ネットワーク構築、experts テーブルに実 row 追加
- **マニュアル native review**: フィリピン人ベータ参加者に `docs/manual-tl.md` レビュー依頼
- **Sentry 系 advisor 残**: function_search_path_mutable × 4 関数の `SET search_path = ''` 追加（Phase 2 polish）

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
