# Philippine Community v2

在日フィリピン人の生活サポートプラットフォーム（再構築版）

要件定義: `~/.claude/plans/claude-me-bot-federated-cook.md`
ブランチ: `main`（W1 スキャフォールド時点）

---

## このディレクトリは何か

`/Users/ryuhe/開発/フィリピン人サポート` リポジトリ配下の v2 用 monorepo パッケージ。
ルートの v1 実装（`/src`, `/supabase`）とは**完全に独立**しており、`apps/v2/` 内で閉じた依存関係・スキーマ・デプロイを持つ。

---

## 技術スタック

| 層 | 採用技術 |
|---|---|
| フロントエンド | Next.js 16.2.2 + React 19.2.4 + Tailwind v4 + shadcn/ui |
| 多言語化 | next-intl 4.9（ja / en / tl） |
| 認証 | Supabase Auth + Facebook OAuth |
| DB | Supabase Postgres + pgvector + RLS |
| AI | Google Gemini 2.5 Flash + text-embedding-004 |
| 決済 | Komoju（カード / GCash / 銀行振込） |
| Bot | Facebook Messenger Platform |
| 監視 | Sentry + Vercel Analytics |
| Hosting | Vercel + Supabase（v2 専用プロジェクト） |

---

## ローカル開発（W1 スキャフォールド完了時点での想定動作）

### 前提
- Node.js 20+
- pnpm 9+（root 直下に `pnpm-workspace.yaml` あり）
- Supabase CLI（v2 用に新規プロジェクト作成済みであること）

### 初回セットアップ

```bash
# リポジトリルートで
pnpm install

# v2 用 .env.local を作成（.env.example をコピーして埋める）
cp apps/v2/.env.example apps/v2/.env.local
# 必要な環境変数:
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
#   FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
#   GEMINI_API_KEY
#   KOMOJU_PUBLIC_KEY, KOMOJU_SECRET_KEY, KOMOJU_WEBHOOK_SECRET
#   MESSENGER_PAGE_ACCESS_TOKEN, MESSENGER_VERIFY_TOKEN, MESSENGER_APP_SECRET
#   SENTRY_DSN
#   NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase migration 適用（ローカルまたはリモート v2 プロジェクト）
cd apps/v2
supabase link --project-ref <your-v2-project-ref>
supabase db push
```

### 起動

```bash
# リポジトリルートから
pnpm --filter v2 dev

# または apps/v2/ で
cd apps/v2 && pnpm dev
```

ブラウザで `http://localhost:3000/ja` にアクセス。`/en` `/tl` も切替可能。

### 型チェック・Lint

```bash
pnpm --filter v2 typecheck
pnpm --filter v2 lint
```

---

## W1 完了の Definition of Done

- [ ] `pnpm install` がルートから走る
- [ ] `pnpm --filter v2 dev` でローカル起動でき、ランディングページが ja/en/tl で表示
- [ ] `apps/v2/supabase/migrations/001_v2_schema.sql` が `supabase db push` で通る
- [ ] `pnpm --filter v2 typecheck` エラー 0
- [ ] `pnpm --filter v2 lint` warning 0

---

## 実装スケジュール

| 週 | フェーズ | 主要タスク |
|---|---|---|
| W1 | A. スキャフォールド | 本ファイル時点の構成 |
| W2 | B. 認証・i18n・骨格 | Facebook OAuth、初回モーダル、位置情報入力、利用規約同意 |
| W3 | C. 管理画面骨格 | 記事/FAQ CRUD |
| W4 | D. Whitelist + Gemini | 二段階検知、PII検出、ディスクレーマーUI |
| W5 | E. RAG + チャット完成 | content_embeddings、Web チャット、月次カウンタ |
| W6 | F. Komoju 課金 | プラン選択、Checkout、Webhook、銀行振込仮扱い |
| W7 | G. Messenger Bot + オペレーターモード | webhook、PSID 連携、Takeover/Release UI、Realtime同期 |
| W8 | H. 飲食店カタログ + 仕上げ | restaurants CRUD、地域フィルタ、E2E、セキュリティスキャン |
| W9-10 | I. クローズドベータ | 10〜20名、AI出力監査 |
| W11〜 | J. オープンローンチ | Facebook広告、運用 |

---

## 重要な設計判断（要件定義書からの抜粋）

- **個人情報は最小限**。在留カード番号・パスポート等は収集しない（PII検出で入力もブロック）
- **位置情報は都道府県+市区町村のみ必須**（地域コンテンツ・近隣マッチング用）
- **Welcome Trial 30日間**: 登録から30日間はチャット無制限・無料
- **31日目以降**: 月3回無料 / 4回目から有料（月1,100円 or 一括前払い割引あり）
- **AI 安全策**: Conservative Whitelist（キーワード検知 + LLM自己判定）+ 全件士業エスカレ
- **オペレーターモード**: 管理者がチャットを見て必要なら Takeover、双方向で人間応答（admin限定権限、士業法配慮で運用ルール厳守）
- **デフォルト言語**: 初回モーダルで ja/en/tl から選択 → localStorage 永続化

---

## ディレクトリ構造

```
apps/v2/
├─ src/
│  ├─ app/
│  │  ├─ [locale]/                # i18n ルーティング（W1 では layout + landing のみ）
│  │  ├─ admin/                   # 管理画面（W3 以降）
│  │  ├─ api/                     # API ルート（W4 以降）
│  │  └─ auth/callback/           # Facebook OAuth（W2）
│  ├─ components/                 # UI コンポーネント
│  ├─ lib/
│  │  ├─ ai/                      # Gemini, Whitelist, RAG, Embedding, PII（W4-W5）
│  │  ├─ supabase/                # client/server/admin（W2）
│  │  ├─ komoju/                  # client, webhook（W6）
│  │  ├─ messenger/               # webhook, send API（W7）
│  │  ├─ operator/                # takeover/release/realtime（W7）
│  │  ├─ usage/                   # monthly counter, trial guard（W5）
│  │  ├─ auth/                    # requireAdmin, requireEditor（W3）
│  │  ├─ pii/                     # PII 検出（W4）
│  │  ├─ i18n/                    # 既に存在
│  │  └─ utils/                   # cn など共通
│  ├─ messages/ja.json en.json tl.json
│  ├─ types/
│  └─ middleware.ts
├─ supabase/
│  ├─ migrations/001_v2_schema.sql
│  └─ tests/
└─ tests/
   ├─ unit/
   ├─ integration/
   └─ e2e/
```

---

## 注意事項

- **AGENTS.md の警告**: Next.js 16 は破壊的変更を含むため、API 実装時は必ず `node_modules/next/dist/docs/` を参照すること
- **既存 v1 実装は touch しない**: `/src` `/supabase` `/package.json` などのルート配下既存ファイルは参照専用、変更しない
- **Supabase**: v1 と v2 は**別プロジェクト**。v1 のデータを v2 へ移行する計画は当面なし
