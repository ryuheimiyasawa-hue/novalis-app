# Vercel 本番デプロイ Hardening チェックリスト

作成: 2026-05-17 / 対象: novalis-v2 Supabase project + 新規 Vercel project。

MVP A-E 完了直後のデプロイ前点検として上から順に潰す。各項目は完了時にチェック。

---

## 1. Vercel プロジェクト設定

### プロジェクト作成・連携
- [ ] GitHub repo を Vercel に import（main = production、PR = preview 自動）
- [ ] Framework Preset = **Next.js**（自動検出）
- [ ] **Root Directory = `apps/v2`**（monorepo なので明示必須。デフォルトのままだとビルド失敗）
- [ ] Node.js version = 22.x（`apps/v2/package.json` engines 確認）
- [ ] Install Command = `pnpm install --no-frozen-lockfile`（`pnpm-lock.yaml` 同期前提なら `--frozen-lockfile`）
- [ ] Build Command = デフォルト `pnpm run build`
- [ ] Output Directory = デフォルト `.next`

### 環境変数（Production / Preview / Development 分離）

**核心**:
- [ ] `GEMINI_API_KEY` (Production 必須、Preview は production 共有 OK)
- [ ] `GEMINI_MODEL=gemini-2.5-flash`
- [ ] `GEMINI_TIMEOUT_MS=30000`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（または ANON_KEY、現行のキー命名に合わせる）
- [ ] `SUPABASE_SERVICE_ROLE_KEY`（**Production のみ**、絶対に NEXT_PUBLIC を付けない、preview にも基本的に共有しない）

**Auth**:
- [ ] `NEXTAUTH_URL` or `AUTH_URL`（auth 構成要確認）
- [ ] Facebook OAuth credentials (`FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`)

**MVP A-E で追加された env**:
- [ ] `NEXT_PUBLIC_CONTACT_FORM_URL`（MVP-E、Google Form の公開 URL。未設定なら /contact が「準備中」プレースホルダ表示）

**Phase 2 未使用、設定不要**:
- `KOMOJU_*`（課金、Phase 2）
- メッセンジャー webhook secret（Phase 2）

**Observability**:
- [ ] `SENTRY_DSN` (Production / Preview 別 DSN を推奨)
- [ ] `SENTRY_AUTH_TOKEN`（source map upload 用、保護必須）

### ドメイン
- [ ] 暫定 `novalis-ph.vercel.app`（カスタム不要、即発行）
- [ ] 正式ドメイン取得検討: `novalis.ph` (.ph は登録費高め、年 ¥6000〜)、または `novalis-support.com` 等
- [ ] DNS 切替前に Vercel preview URL でリリース判定

---

## 2. Supabase production hardening

### RLS 最終確認
- [ ] 全テーブルで RLS policies が `auth.uid()` ベースで設定されているか:
  - `conversations` / `messages` / `chat_usage` — row-owner policy 必須
  - `articles` / `categories` / `faqs` / `experts` — public SELECT 許可、admin write は service_role
  - `profiles` — owner-only SELECT / UPDATE
  - `consent_logs` / `subscriptions` — owner-only
  - `inquiries` — Phase 2 で使用、現状 0 行
  - `webhook_logs` — service_role only
  - `content_embeddings` — service_role only
- [ ] `match_content` RPC が `SECURITY DEFINER` であること確認（migration 004 で設定済）

### Service Role Key 管理
- [ ] Service Role Key を **Vercel Production env にのみ設定**
- [ ] Preview / Dev で漏らさない
- [ ] git 履歴に絶対含めない（`.env.local` は .gitignore 確認）

### DB バックアップ
- [ ] Free tier の 7 日 daily backup を確認（デモまでは足りる）
- [ ] ベータ後の本格運用前に Pro plan の Point-in-time Recovery 有効化を検討

### Connection pooling
- [ ] Vercel serverless function は per-request 接続なので **Supabase Transaction Mode pooler** を使う
- [ ] 接続文字列のポート: **5432 でなく 6543**

### Migration 規律（Lesson 24/25 由来、Phase 2 必須）
- [ ] **migration の正規適用フロー に切替**:
  - Supabase CLI (`supabase db push` / `supabase migration up`) で適用
  - CI で「未適用 migration があれば fail」する gate を入れる
  - production 適用時は `supabase migration list` で履歴を残す
- [ ] **当面の運用**: SQL Editor で適用する場合、各 ALTER の後に `information_schema.columns` の verify SELECT を必ず実行（Lesson 24）
- [ ] **本番にまだ適用していない migration**:
  - [ ] **migration 006** (`articles.video_url` + `video_provider`) を SQL Editor で実行する → デプロイ前必須

### CORS / Auth redirects
- [ ] Supabase auth redirect URLs に Vercel ドメインを追加（`https://novalis-ph.vercel.app/auth/callback` 等）
- [ ] 本番ドメイン取得後に追加し直す

---

## 3. Sentry production セットアップ

- [ ] Sentry プロジェクト新規作成（既存があれば使い回し可）
- [ ] `@sentry/nextjs` SDK 導入（未導入なら `pnpm add @sentry/nextjs` + `npx @sentry/wizard`）
- [ ] Production DSN を Vercel env に
- [ ] Source map upload を CI に組み込む（Vercel ビルド時に `SENTRY_AUTH_TOKEN` で自動 upload）
- [ ] **PII フィルタ**: Sentry の `beforeSend` で chat message content を masking（既存 `detectPii` 流用可）
- [ ] エラー通知: 致命的エラーで Slack/メール通知
- [ ] **persistence 失敗を必ず Sentry に送る**（Lesson 25 由来。`[chat/send] persist failed` を console.error だけで放置していたため8日サイレント壊れが発生した教訓）
- [ ] **scope**: Free tier 5k events/month で MVP 期間は足りる見込み

---

## 4. Gemini production hardening

- [ ] **Billing 確認**: Production 環境で 5/15 以降の支払い実績ログ → ¥3,000 アラート設定確認（Lesson 23）
- [ ] **モデル version pinning**: `gemini-2.5-flash` でなく `gemini-2.5-flash-001` のように suffix を明示することを Phase 2 で検討
- [ ] **Rate limit テスト**: 本番 API key の RPM/RPD 制限を確認（Paid Tier 1 = 1000 RPM、ベータ規模では充分）
- [ ] **Failsafe 確認**: 429 / timeout で classifier → individual escalate が本番でも動くこと
- [ ] **モデル切替準備**: env で `GEMINI_MODEL` 可変な作りを確認（[gemini.ts:34](apps/v2/src/lib/ai/gemini.ts#L34) 対応済）

---

## 5. 利用規約・プラポリ判断（経営判断必要）

**推奨判断**:
- **ベータリリース時点** = 「テスター向けβ版、内容は予告なく変更されます。AI 応答は一般情報の提供のみで個別具体的な法的助言ではありません」と明示すれば**監修なし可**
- **一般公開時点（プロダクトハント等）** = 弁護士監修完了が前提

- [ ] 暫定文言を `/[locale]/legal/terms` / `/legal/privacy` ページに置く（MVP 外でも可、フッタリンクだけは出す）
- [ ] **AI 出力の standing disclaimer が出ていること**を本番でも確認（[messages/*.json chat.disclaimer](apps/v2/src/messages/) — 弁護士監修まで唯一の盾）

---

## 6. ビルド / フロントエンド検証

- [ ] **ローカル `pnpm build` 成功**（Vercel build と同等を手元で再現）
- [ ] Vercel build log で warning なし
- [ ] **画像最適化**: next/image を使ってる箇所が CDN 配信されること
- [ ] **ISR 動作確認**: 記事一覧/詳細の revalidate 設定が production で動くこと
  - C 実装で `/[locale]/articles` を `revalidate: 600`
  - admin 側の `revalidateArticles` ヘルパが invalidate に効くこと（C-8 helper）
- [ ] **i18n**: 3言語ルーティングが production URL で機能すること（/ja, /en, /tl）
- [ ] **Vercel Analytics 有効化**（標準で web vitals 取れる）
- [ ] **Security headers**: `next.config.ts` で CSP / HSTS / X-Frame-Options 設定
  - D 案1 (iframe whitelist 不要) を採用したので `frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://docs.google.com` のみ追加
  - Google Form embed は docs.google.com から配信

---

## 7. デプロイ後の動作確認シナリオ

Production / Preview 両方で実行:

### Chat (MVP-A)
- [ ] 3 ターン会話 → `history=N` が dev console log に出る（Vercel runtime log で確認可）
- [ ] 文脈継承で classifier が 2 ターン目以降の判定を変える
- [ ] dev log に `[whitelist-llm] classify raw / parsed` が出ること
- [ ] `[chat/send] persist failed` が出ないこと

### Past conversations (MVP-B)
- [ ] `/conversations` で過去スレッド一覧表示
- [ ] スレッドクリックで `/chat?conversation_id=xxx` 復元
- [ ] reload しても会話続行
- [ ] 「新しい相談を始める」で URL query 消去 + 新規 conversation 作成

### Articles list (MVP-C)
- [ ] `/articles` で公開記事一覧 + ページネーション
- [ ] 詳細ページ遷移
- [ ] ISR キャッシュ動作（連続リロードで応答時間短縮）
- [ ] dashboard CTA から到達

### Video embed (MVP-D)
- [ ] admin で 1記事に YouTube URL を設定 → 公開ページで iframe 表示
- [ ] Vimeo URL も同様
- [ ] 不正 URL は silently dropped（iframe 出ない）
- [ ] スマホで動画再生可能（fullscreen 動作）

### Contact (MVP-E)
- [ ] EscalationCard 末尾の「Novalis サポートに問い合わせる」ボタン押下
- [ ] `/contact` ページで Google Form 表示
- [ ] フォーム送信 → Google Sheet に行追加 + 通知メール受信を確認
- [ ] env 未設定時は「準備中」プレースホルダ表示

---

## 8. git workflow（Phase 2 開発と並行運用）

**ブランチモデル**:
- `main` = Vercel production（auto-deploy）
- `feat/<topic>` = 機能ブランチ。1 機能 1 PR
- `fix/<topic>` = ホットフィックス
- ローカル dev は手元のみ、push しない

**Vercel preview の運用ルール**:
- preview = production と env 共有（暫定）
- preview で chat を打つと本番 DB に書き込まれる
- destructive op（admin 経由の削除等）は preview で実行しない
- 本格 staging が必要になったら Supabase の branching を有効化（Pro plan 機能）

**PR テンプレ**（`.github/PULL_REQUEST_TEMPLATE.md` に配置推奨）:
```
## 変更内容
-

## テスト
- [ ] vitest 全 pass
- [ ] tsc clean
- [ ] preview URL で動作確認
- [ ] DB 書き込みが本番に影響しないか確認
- [ ] 新規 migration があれば apps/v2/supabase/migrations/ に追加 + production 適用方法を記載
```

---

## 9. デプロイ前 最終 Go/No-Go

- [ ] 全 unit test pass (`pnpm vitest run tests/unit`)
- [ ] tsc clean (`npx tsc --noEmit`)
- [ ] `pnpm build` ローカル成功
- [ ] migration 006 を production DB に適用済
- [ ] Vercel env vars 全て設定
- [ ] Google Form 作成 + URL 設定
- [ ] Sentry DSN 設定（or 暫定で Sentry なしで GO の判断）
- [ ] 利用規約/プラポリ ベータ版文言だけでも fotter に表示
- [ ] dashboard / chat / conversations / articles / contact 全ページ手動疎通

---

## 10. デプロイ後 24 時間モニタリング

- [ ] Vercel runtime log で `persist failed` が出ていないか
- [ ] Sentry でエラー件数 monitoring（あれば）
- [ ] Supabase dashboard で接続数・クエリ時間異常なし
- [ ] Gemini billing dashboard で支出推移確認
- [ ] ベータユーザーからのフィードバックを Google Form / Slack で受け取れる状態
