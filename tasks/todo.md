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

**設計フェーズ文書**: `tasks/W2-design.md`（**v2 ユーザー承認待ち** - 2026-05-07 更新: feature flag + ドメイン構成反映）
**着手条件**: 設計文書の承認 + ユーザー側作業（環境変数取得）の完了

### W2 実装タスク（設計承認後に展開、ユーザー指定の優先順）

#### B-1. 認可ミドルウェア層（H1 対応含む、最優先）
- [ ] proxy.ts のホワイトリスト方式書き換え（公開パスのみ素通し、それ以外は session 取得）
- [ ] `lib/auth/require-auth.ts` / `require-onboarded.ts` / `require-consent.ts` / `require-admin.ts` / `require-editor.ts` / `require-operator-role.ts`
- [ ] `lib/payment/is-payment-enabled.ts`（feature flag 1関数のみ）
- [ ] `app/[locale]/(public)/` と `app/[locale]/(authed)/` の Route Group 分離
- [ ] `(authed)` route group の layout で session ガード
- [ ] `lib/env/validate.ts`（必須 env 検証、起動時エラー化）

#### Phase 2 持ち越し（W2 中に発見、本フェーズでは対応しない）
- [ ] proxy.ts の `checkOnboarded` を JWT custom claim or short-lived cookie cache に切替（毎リクエスト DB 往復を回避）
- [ ] proxy.ts / api/consent の `console.warn`/`console.error` を Sentry 化（B-7 で）

#### B-2. 認証フロー（Facebook OAuth）✅ 完了
- [x] `lib/supabase/{client,server,admin}.ts` 作成（cookie domain は §6-6 仕様）
- [x] `app/[locale]/login/page.tsx`（`signInWithOAuth` 呼出）+ login-form / error-banner / language-switcher
- [x] `app/auth/callback/route.ts`（access_denied エラー処理含む、HttpOnly cookie で失敗カウント管理）
- [x] handle_new_user trigger を補完する `ensureProfile()` ヘルパー（PK 違反 23505 を捕捉して冪等化）
- [x] `lib/auth/redirect-validator.ts` + 12 テストケース（5攻撃ベクトル含む）
- [x] vitest テスト基盤
- [ ] **将来 TODO**: 実機 Supabase 接続後、`supabase gen types typescript` で `src/types/database.ts` を全テーブル網羅版に置換（現状は W2 で必要な profiles/consent_logs/admin_roles のみ手書き）

#### B-3. 利用規約同意フロー＋同意ログ
- [ ] migration 002: `profiles.onboarded_at` 追加 + `consent_logs` UNIQUE(user_id, document_type, version) + 関連 INDEX
- [ ] `lib/legal/versions.ts`（CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION）
- [ ] `public/legal/{terms,privacy}/1.0.0/{ja,en,tl}.md` ドラフト版（弁護士監修は並行）
- [ ] `app/[locale]/consent/page.tsx`
- [ ] API: `/api/consent` POST, `/api/consent/me` GET
- [ ] prebuild script: `versions.ts` に対応する legal ファイルが存在するか検証

#### B-4. 初回モーダル＋オンボーディング
- [ ] `components/layout/initial-language-modal.tsx`
- [ ] `app/[locale]/onboard/page.tsx`
- [ ] API: `/api/profile/me` GET/PATCH, `/api/profile/onboard` POST

#### B-5. 位置情報入力
- [ ] 都道府県ドロップダウン（ISO 3166-2:JP コード、47都道府県）
- [ ] 市区町村は自由入力（zipcloud 連携は将来オプション）
- [ ] `prefecture_code` Zod 検証 (`/^JP-\d{2}$/`)

#### B-6. i18n 言語切替
- [ ] ヘッダー言語スイッチャー（フォーム画面では非表示 or confirm ダイアログ、§7 S2 対処）
- [ ] localStorage と `profiles.preferred_language` の同期

#### B-7. Sentry 接続
- [ ] `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` / `instrumentation.ts`
- [ ] `beforeSend` で PII を除去するフィルター（ユーザー発話・メールアドレス等）
- [ ] `app/auth/callback/route.ts` の `console.warn` / `console.error` を `Sentry.captureMessage` / `Sentry.captureException` に置換（B-2 で残した監視 TODO）

#### B-8. UI: 「無料開放中」バッジ
- [ ] `components/layout/free-trial-badge.tsx`（feature flag false 時のみ表示）
- [ ] 3言語コピー追加（messages/{ja,en,tl}.json）

#### B-9. テスト
- [ ] `lib/auth/*` のユニットテスト
- [ ] `lib/payment/is-payment-enabled.ts` のユニットテスト（true/false/未設定）
- [ ] API ルートの統合テスト（未認証 / 他人リソース / 権限不足 / feature flag 切替）
- [ ] RLS テスト（pgtap）
- [ ] E2E: 新規登録ゴールデンパス、同意拒否、言語切替、Admin アクセス

### W2 Definition of Done
- [ ] tasks/W2-design.md のすべての設計項目が実装済み
- [ ] H1 が解消（proxy.ts でホワイトリスト方式、各ルートで個別ガード）
- [ ] feature flag 動作確認: false でログイン→全機能アクセス可能、true で paywall 動作（true は手動切替テストのみ）
- [ ] typecheck / lint / build エラー 0
- [ ] 統合テスト・E2E テスト pass
- [ ] RLS テスト pass
- [ ] 5役割監査（致命・高 0件）
- [ ] 利用規約・プラポリ ドラフト版が3言語で配置（弁護士監修は並行で W7 まで）
- [ ] 各タスク完了ごとに git commit、5役割監査結果をコミットメッセージに含める

---

## ユーザー側作業（W2 着手前に並行進行）

### A. 即着手・今夜中に完了可能（自分で完結）
- [ ] **Supabase v2 新規プロジェクト作成**（10分）
  - リージョン: ap-northeast-1 (Tokyo)
  - 取得値: Project URL / anon key / service_role key
- [ ] **Gemini API key 発行**（5分）— https://aistudio.google.com/app/apikey
- [ ] **Sentry プロジェクト作成**（10分）
  - 取得値: SENTRY_DSN / SENTRY_ORG / SENTRY_PROJECT

### B. 即着手・審査待ち（最優先で発信）
- [ ] **Facebook Page 作成 → Developer App → permission 申請**
  - W2 で必要な permission: `email`, `public_profile`（OAuth）
  - W7 で必要な追加 permission: `pages_messaging`, `pages_show_list`（Messenger Bot）
  - Valid OAuth Redirect URIs: `https://app.novalis.ph/api/auth/callback` + `http://localhost:3000/api/auth/callback`
  - 審査期間: 数日〜数週間
  - W2 取得値: FACEBOOK_APP_ID / FACEBOOK_APP_SECRET
  - W7 取得値: MESSENGER_PAGE_ACCESS_TOKEN / MESSENGER_VERIFY_TOKEN / MESSENGER_APP_SECRET

### C. 並行で外部発注/連絡
- [ ] **ドメイン設定**: `app.novalis.ph` のサブドメインを Vercel に向ける（CNAME 等）
- [ ] **弁護士監修の依頼**（利用規約・プラポリ 3言語、W7 完成目標）
- [ ] **協業企業へクローズドベータ参加者の打診**（W7 までに 10〜20名）

### D. 後回し可（環境変数設定後）
- [ ] `apps/v2/.env.example` を `.env.local` にコピーして全 env を設定
- [ ] `cd apps/v2 && supabase link --project-ref <ref> && supabase db push`
- [ ] `pnpm --filter v2 dev` でローカル起動確認

### E. W2 では不要、W7 以降に着手
- ~~**Komoju 本番アカウント審査申請**~~ → `NEXT_PUBLIC_PAYMENT_ENABLED=true` 切替時に申請
- ~~**Komoju テストアカウント作成**~~ → 課金 UI 実装フェーズで取得（任意で先行取得しておくのも可）

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

