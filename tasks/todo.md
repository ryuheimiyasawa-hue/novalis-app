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

### W2 開始前の必須対応（W1 監査からの繰越事項）

- [ ] **H1（高）**: `apps/v2/src/proxy.ts` で `/api/*` と `/admin/*` を素通し中。各 API ルート / admin ページに認可ガード（`requireAuth()` / `requireAdmin()` / `requireEditor()`）を実装し、proxy 側の素通しは「公開webhook の早期通過」のみに限定する。Whitelist 方式で公開パスを厳格管理。
- [ ] **W2 セットアップ**: Sentry 接続（`sentry.client.config.ts`、`sentry.server.config.ts`、`instrumentation.ts`）
- [ ] **W2 セットアップ**: `lib/supabase/{client,server,admin}.ts` 作成（既存 v1 の実装パターン参考）
- [ ] **W2 セットアップ**: `lib/auth/{require-auth,require-admin,require-editor}.ts` 作成
- [ ] **W2 セットアップ**: `app/auth/callback/route.ts`（Facebook OAuth コールバック、`profiles` の `prefecture_code`/`city_name` 空文字を検出してオンボーディングへ誘導）
- [ ] **W2 機能**: 初回モーダル（言語選択 → localStorage 永続化）
- [ ] **W2 機能**: オンボーディングフロー（都道府県+市区町村 必須入力、利用規約同意）
- [ ] **W2 機能**: 利用規約・プラポリのドラフト 3言語版（弁護士監修は並行）
- [ ] **W2 テスト**: handle_new_user trigger 後にオンボーディングを完了させる E2E テスト

---

## Phase C — W3: データモデル + 管理画面骨格
## Phase D — W4: Whitelist + Gemini 接続
## Phase E — W5: RAG + チャット完成

主要タスク（W5 着手時に詳細化）:
- content_embeddings テーブルへの初期投入バッチ
- `/api/chat/send`（同期 fallback、Messenger Webhook と Web 同期送信兼用）
- `/api/chat/stream`（**Web 専用 SSE ストリーミング**、Gemini ストリーミング → トークン逐次送信）
- Web チャット UI（`app/[locale]/chat/`）
  - 会話一覧（`channel='web'|'messenger'` 統合表示、チャネル識別バッジ）
  - メッセージ送信フォーム + ストリーミング応答受信
  - 記事リンクのインラインプレビュー（RAG ソースを展開）
  - エスカレ案内のインライン CTA
  - ディスクレーマーの常時表示
- 月次カウンタ lazy reset 実装（JST 月初）
- Welcome Trial 判定の API ガード
- E2E: 会話送信 → ストリーミング受信 → 履歴反映

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

