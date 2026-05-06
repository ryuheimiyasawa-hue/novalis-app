# Philippine Community v2 — 実装 ToDo

承認済み要件定義: `~/.claude/plans/claude-me-bot-federated-cook.md`
作業ブランチ: main（v2 は `apps/v2/` 配下に独立 workspace で構築）
開始日: 2026-05-06

---

## Phase A — W1: スキャフォールド（ファイル作成完了、動作確認待ち）

- [x] プランファイル 17-1 を確定値に更新
- [x] tasks/todo.md 作成（本ファイル）
- [x] apps/v2/ ディレクトリ階層を作成
- [x] ルートに pnpm-workspace.yaml 作成
- [x] apps/v2/package.json（Next.js 16, React 19, 必要依存）
- [x] apps/v2/tsconfig.json
- [x] apps/v2/next.config.ts（next-intl 統合）
- [x] apps/v2/.env.example
- [x] apps/v2/.gitignore
- [x] apps/v2/eslint.config.mjs
- [x] apps/v2/postcss.config.mjs
- [x] apps/v2/components.json（shadcn 用）
- [x] apps/v2/src/app/layout.tsx（root pass-through）
- [x] apps/v2/src/app/[locale]/layout.tsx（html/body + NextIntlClientProvider）
- [x] apps/v2/src/app/[locale]/page.tsx（ランディング骨格）
- [x] apps/v2/src/app/globals.css（Tailwind v4 + tw-animate-css）
- [x] apps/v2/src/messages/{ja,en,tl}.json（最小翻訳）
- [x] apps/v2/src/lib/i18n/{config,routing,request}.ts
- [x] apps/v2/src/lib/utils/cn.ts
- [x] apps/v2/src/middleware.ts（i18n + 公開API除外骨格）
- [x] apps/v2/supabase/migrations/001_v2_schema.sql（全テーブル + RLS + match_content RPC）
- [ ] apps/v2/supabase/tests/rls.test.sql（pgtap 骨格） — W2 着手時に追加
- [x] apps/v2/README.md（W1 動作確認手順）

### W1 Definition of Done（**未確認**: pnpm install / dev 起動 / migration 適用は実機で検証要）
- [ ] `pnpm install` が走る（root から）
- [ ] `pnpm --filter v2 dev` でローカル起動できる（最低限ランディング表示）
- [ ] `supabase db reset` で migration が通る
- [ ] `pnpm --filter v2 typecheck` エラー 0
- [ ] `pnpm --filter v2 lint` warning 0

### W1 ブロッカー / 確認待ち
- pnpm 9+ / Node.js 20+ がローカルにインストール済みか
- Supabase v2 用の新規プロジェクト作成（ユーザーアクション）
- Facebook Developer App, Komoju テストアカウント, Gemini API key の準備（並行）

---

## Phase B — W2: 認証・i18n・骨格

（W1 完了後に展開）

---

## Phase C — W3: データモデル + 管理画面骨格
## Phase D — W4: Whitelist + Gemini 接続
## Phase E — W5: RAG + チャット完成
## Phase F — W6: Komoju 課金
## Phase G — W7: Messenger Bot + オペレーターモード
## Phase H — W8: 飲食店カタログ + 仕上げ
## Phase I — W9-10: クローズドベータ
## Phase J — W11〜: オープンローンチ

---

## 並行作業（W1 開始時から伝とし始める）

- [ ] 弁護士監修の利用規約・プラポリ 3言語版作成（W7 までに完成）
- [ ] Facebook Developer App 申請（Messenger Bot 審査用、W6 開始）
- [ ] Komoju 本番アカウント審査開始
- [ ] 協業企業へクローズドベータ参加者依頼（W7 頃）
- [ ] コンテンツ初期投入: 7カテゴリ × 3言語 × 各5件（AI生成 → 士業監修、W4-W8）

---

## レビュー（各フェーズ完了時に追記）

### W1 レビュー（実装後に追記）

