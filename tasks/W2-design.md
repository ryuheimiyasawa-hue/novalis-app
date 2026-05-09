# W2 Phase 1 設計フェーズ文書

準拠: `~/.claude/CLAUDE.md` Part 2.1（設計フェーズ実装前必須項目10）
作成日: 2026-05-07
ステータス: **承認待ち**（実装着手は本文書承認後）
W2 のリリース計画上の位置: プランファイル §12 W2「認証・i18n・骨格」

---

## 0. W2 のスコープ（実装する機能）

1. **H1 修正**: `proxy.ts` の `/api/*` `/admin/*` 素通しを塞ぐ。ホワイトリスト方式で公開パスを厳格管理。各保護ルートで個別ガードを実装
2. **Supabase クライアント基盤**: `lib/supabase/{client,server,admin}.ts`
3. **Sentry 接続**: `sentry.{client,server,edge}.config.ts` + `instrumentation.ts`
4. **Facebook OAuth**: ログイン → コールバック → プロフィール作成
5. **初回モーダル**: 言語選択（ja/en/tl）→ localStorage 永続化
6. **オンボーディングフロー**: 都道府県＋市区町村 必須入力、利用規約同意
7. **認可レイヤー**: `requireAuth` / `requireOnboarded` / `requireAdmin` / `requireEditor`
8. **3言語の利用規約・プラポリ ドラフト版**（弁護士監修は並行作業）
9. **Feature flag 基盤**: `NEXT_PUBLIC_PAYMENT_ENABLED`（後述 §6-5）— W2 ではすべての paywall 判定に関わるが、デフォルト false で UI/API は無効化

W2 で実装しないもの（後続フェーズ）:
- AI チャット（W4-W5）
- 課金 UI / Komoju 統合（**W2 では実装しない、リリース後しばらくは無料開放のため**。スキーマと feature flag だけ用意し、将来 flag を true に切替えるだけで起動できる構成にする）
- Messenger Bot（W7）
- オペレーターモード（W7）

---

## 0-bis. ドメイン構成（2026-05-07 確定）

| サービス | URL | リポジトリ | 役割 |
|---|---|---|---|
| LP | `https://novalis.ph/` | 別リポジトリ `novalis-ph`（既デプロイ） | 静的サイト、サービス案内、登録誘導 |
| 本サービス | `https://app.novalis.ph/` | 本リポジトリ `apps/v2/` | PWA、認証、Web チャット、管理画面 |
| API | `https://app.novalis.ph/api/*` | 同上 | Route Handler |

**設計上の影響**:
- Facebook OAuth callback URL: `https://app.novalis.ph/api/auth/callback`
- `NEXT_PUBLIC_APP_URL=https://app.novalis.ph`
- 認証 Cookie の domain: **`app.novalis.ph` 専用**（後述 §6-6）
- LP → 登録フロー: LP の CTA から `https://app.novalis.ph/[locale]/login` へ単純遷移（CORS 不要、cross-origin リダイレクトのみ）

---

## 1. 機能仕様の確認と曖昧点の質問（最低3つ）

### Q1. 利用規約同意前のユーザーはどこまでアクセス可能か？

**選択肢**:
- (a) 完全ロック: 利用規約同意するまで「同意画面」以外すべて非表示。公開コンテンツ（ランディング・利用規約本文・プライバシーポリシー本文）のみアクセス可
- (b) 緩い: コンテンツ閲覧（記事・FAQ・飲食店）は同意前でも可、AI チャット/エスカレ/設定など能動的アクションのみ要同意
- (c) 段階的: 言語選択後すぐに同意画面、同意後にオンボーディング（位置情報）

**推奨**: **(c) 段階的**。ユーザー体験として「言語 → 同意 → 位置情報 → ホーム」の自然な動線。記事閲覧は誰でも可（未ログイン含む）。AI チャット等は同意+位置情報入力済が必要。

**仕様確定（W2 着手時にユーザー確認）**:
- 未ログイン: ランディング・記事閲覧・利用規約本文・プラポリ本文のみアクセス可
- ログイン直後（同意なし、`consent_logs` に terms と privacy が両方ない）: 同意画面に強制リダイレクト
- 同意済（位置情報なし、`profiles.prefecture_code = ''`）: オンボーディング画面に強制リダイレクト
- 同意済 + 位置情報済: 通常動作

### Q2. 未成年判定はどうするか？

**事実関係**:
- ターゲットは「20-40代」（要件定義 §1-3）が中心。未成年（18歳未満）は事実上含まない
- 個人情報保護法では未成年への個人情報取扱い同意は「本人 + 法定代理人」が必要（一般的に16歳未満で慎重対応）
- 民法上、契約能力は18歳以上

**推奨**: **W2 では生年月日を取得せず、利用規約に「本サービスは18歳以上を対象とします」と明記する**だけにとどめる。生年月日や年齢確認は MVP のスコープ外。

**理由**:
- 生年月日は要配慮個人情報に近く、収集する正当な利用目的が必要
- 取得しない方が「個人情報最小化」原則と整合する
- もし将来未成年トラブルが発生した場合、利用規約違反として対処可能

**確定**: 利用規約に「18歳以上限定」明記。データモデルに生年月日カラムは追加しない。

### Q4. 認証 Cookie の domain は app.novalis.ph 専用 vs .novalis.ph どちら？

**確定**: **`app.novalis.ph` 専用**（Cookie の Domain 属性は付けない、または `app.novalis.ph` 明示）

**理由**:
- LP（`novalis.ph`）は静的サイトとして独立、個人化 UI（マイページ等）は持たない
- LP に脆弱性が見つかった場合に認証 Cookie が漏れるリスクを排除
- 将来 LP に個人化 UI を足したくなったら、その時点で `.novalis.ph` への昇格を検討（ユーザーは再ログインだけで対応可能）
- Supabase Auth の Cookie は HttpOnly + Secure + SameSite=Lax が既定。これに加えて Domain を `app.novalis.ph` に固定

**具体的な実装**:
- Supabase Auth の cookie option で `domain: "app.novalis.ph"` を指定（本番のみ。開発は `localhost`）
- `lib/supabase/{client,server}.ts` で env から domain を読む（`NEXT_PUBLIC_APP_URL` から派生）

### Q3. 利用規約の改訂時、既存ユーザーの再同意フローは？

**確定**:
- `consent_logs.version` に semver で管理（例: `terms@1.0.0`, `privacy@1.0.0`）
- 改訂版が出たら `terms@1.1.0` を発行
- ユーザーログイン時に最新バージョンと `consent_logs` を比較し、古ければ「規約改訂のお知らせ + 再同意画面」
- 再同意するまで AI チャット・エスカレ等の能動アクションをブロック（記事閲覧は許可）

---

## 2. データモデル

### 2-1. 既存テーブルへの追加カラム

**`profiles` への追加（W2 で migration 002 として作成）**:
```sql
ALTER TABLE profiles
  ADD COLUMN onboarded_at TIMESTAMPTZ;
```
- `onboarded_at` が NULL: オンボーディング未完了（位置情報未入力）
- 非 NULL: 完了済み

理由: `prefecture_code = ''` を空文字判定するより、オンボーディング完了フラグを別カラムで持つ方が（1）アプリ層の判定がシンプル、（2）将来的にオンボーディング項目が増えても拡張しやすい。

### 2-1-bis. 決済関連テーブル（無料開放中の扱い）

W1 で作成済みの `subscriptions`, `bank_transfer_pending`, `webhook_logs` は **W2 では INSERT/UPDATE しない**。スキーマだけ温存し、`NEXT_PUBLIC_PAYMENT_ENABLED=true` に切替えるタイミングで利用開始する。

**W2 でのアプリ側の扱い**:
- すべての paywall 判定箇所で **`process.env.NEXT_PUBLIC_PAYMENT_ENABLED !== "true"` のとき早期 return で全許可**
- `subscriptions` テーブルには触れない（`profiles` に `plan` カラムは追加しない、テーブル間の参照を増やさない）
- UI のヘッダー or 設定画面に「**無料開放中**」バッジを常時表示（i18n 対応、後で flag を切替えた時に自動で消える）
- Welcome Trial の `trial_started_at` / `trial_ends_at` は profiles に保存し続ける（将来 flag 切替時に「あなたの Trial は X 日まで有効」表示に使う）

**Migration 002 内容（W2）**:
```sql
ALTER TABLE profiles
  ADD COLUMN onboarded_at TIMESTAMPTZ;

ALTER TABLE consent_logs
  ADD CONSTRAINT consent_logs_uniq UNIQUE (user_id, document_type, version);

CREATE INDEX idx_consent_logs_user_doc ON consent_logs(user_id, document_type, consented_at DESC);
```

### 2-2. consent_logs（既存スキーマ §4-2 に定義済み、変更不要）

```sql
consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('terms', 'privacy')),
  version TEXT NOT NULL,  -- semver "1.0.0" 等
  language TEXT NOT NULL, -- 同意時の表示言語
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

**法務的な証拠保全レベル**:
- **不変性**: 一度 INSERT したら UPDATE/DELETE しない（RLS で本人 INSERT のみ許可、UPDATE/DELETE policy 作らない）
- **追跡可能性**: `user_id`, `document_type`, `version`, `language`, `consented_at` の組で一意な事実を保存
- **再現性**: 各 `version` に対応する規約本文は **静的ファイル**として `apps/v2/public/legal/{terms,privacy}/{version}/{ja,en,tl}.md` に配置。git でバージョン管理。デプロイで配信
- **削除請求対応**: ユーザーがアカウント削除を要求した場合、`profiles` に紐づくすべての行（`consent_logs` 含む）が `ON DELETE CASCADE` で削除される。ただし**法定保存期間（民法167条の消滅時効10年など）が経過するまでは、削除リクエスト履歴を別途 `deletion_requests` テーブルで記録**することを推奨（Phase 2 で実装）

**RLS ポリシー（既に W1 で定義済み）**:
- SELECT: 本人のみ（`auth.uid() = user_id`）
- INSERT: 本人のみ（`auth.uid() = user_id`）
- UPDATE/DELETE: ポリシー無し（誰も更新/削除できない、法務証拠保全）

### 2-3. インデックス

```sql
CREATE INDEX idx_consent_logs_user_doc ON consent_logs(user_id, document_type, consented_at DESC);
```
最新の同意バージョンを引くクエリのため。

### 2-4. 利用規約バージョン管理ファイル

```
apps/v2/public/legal/
├─ terms/
│  └─ 1.0.0/
│     ├─ ja.md
│     ├─ en.md
│     └─ tl.md
└─ privacy/
   └─ 1.0.0/
      ├─ ja.md
      ├─ en.md
      └─ tl.md
```

加えて `apps/v2/src/lib/legal/versions.ts` で「現行バージョン」を定数管理:
```ts
export const CURRENT_TERMS_VERSION = "1.0.0";
export const CURRENT_PRIVACY_VERSION = "1.0.0";
```

---

## 3. API契約

### 3-1. 公開 API（認証不要、proxy.ts で素通し許可）

| ルート | メソッド | 概要 | レートリミット |
|---|---|---|---|
| `/api/auth/callback` | GET | Facebook OAuth コールバック（Supabase Auth が処理） | なし（OAuth flow） |
| `/api/messenger/webhook` | GET/POST | Messenger 認証 + 受信（**W7 で実装、W2 では proxy.ts の許可リストにだけ追加**） | 内部実装 |
| ~~`/api/komoju/webhook`~~ | POST | **W2 ではホワイトリストに追加しない**。`NEXT_PUBLIC_PAYMENT_ENABLED=true` に切替えるフェーズ（W7 以降）で proxy.ts に追加 | — |

### 3-2. 認証必須 API（W2 で実装するもののみ）

| ルート | メソッド | 認可 | 概要 | レートリミット |
|---|---|---|---|---|
| `/api/profile/me` | GET | requireAuth | 自プロフィール取得（位置情報・トライアル状態含む） | 60/min |
| `/api/profile/me` | PATCH | requireAuth | 自プロフィール更新（`preferred_language`, `prefecture_code`, `city_name`） | 30/min |
| `/api/profile/onboard` | POST | requireAuth | オンボーディング完了処理（位置情報を確定し `onboarded_at` を NOW() に） | 10/min |
| `/api/consent` | POST | requireAuth | 利用規約・プラポリ同意の記録（`document_type`, `version`, `language` 受領） | 10/min |
| `/api/consent/me` | GET | requireAuth | 自身の最新同意状態取得（terms/privacy のバージョン確認用） | 60/min |

### 3-2-bis. W2 で実装しない決済系 API（将来の TODO）

| ルート | フェーズ | 概要 |
|---|---|---|
| `/api/komoju/webhook` | W7+（flag 切替時） | Komoju 決済 Webhook |
| `/api/subscriptions/checkout` | W7+ | Komoju Checkout セッション作成 |
| `/api/subscriptions/me` | W7+ | 自身のサブスク状態取得 |
| `/api/usage/me` | W7+（flag 切替時） | 月次利用カウンタ取得 |

### 3-3. リクエスト/レスポンスのスキーマ（Zod 定義）

**`/api/profile/onboard` (POST)**:
```ts
// Request
const OnboardRequestSchema = z.object({
  prefecture_code: z.string().regex(/^JP-\d{2}$/),  // ISO 3166-2:JP "JP-13" (Tokyo) 等
  city_name: z.string().min(1).max(100),
  preferred_language: z.enum(["ja", "en", "tl"]),
});
// Response
type OnboardResponse = { ok: true; data: { onboarded_at: string } } | ErrorResponse;
```

**`/api/consent` (POST)**:
```ts
const ConsentRequestSchema = z.object({
  document_type: z.enum(["terms", "privacy"]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  language: z.enum(["ja", "en", "tl"]),
});
```

### 3-4. エラーケース一覧

| エラーコード | HTTP | 発生条件 | UI 対応 |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | requireAuth で session なし | ログイン画面へリダイレクト |
| `FORBIDDEN` | 403 | requireAdmin で admin_roles なし、または requireOnboarded で `onboarded_at IS NULL` | 適切な画面（onboard or no-permission）へ |
| `INVALID_INPUT` | 400 | Zod スキーマ違反 | フォームのフィールドエラー表示 |
| `RATE_LIMITED` | 429 | レートリミット超過 | 「しばらくお待ちください」 |
| `STALE_CONSENT` | 412 | 規約改訂版が出ているが未同意 | 再同意画面へ |
| `INTERNAL_ERROR` | 500 | 想定外例外 | Sentry 送信 + 「エラーが発生しました」 |

---

## 4. 状態遷移と副作用

### 4-1. ユーザー状態遷移

```
[未ログイン]
  ↓ /login → Facebook OAuth
[ログイン直後 / consent_logs に terms,privacy なし]
  ↓ proxy + middleware が同意画面に強制リダイレクト
[同意画面] → POST /api/consent (terms) → POST /api/consent (privacy)
  ↓
[同意済 / profiles.onboarded_at IS NULL]
  ↓ proxy + middleware がオンボーディング画面に強制リダイレクト
[オンボーディング画面] → POST /api/profile/onboard
  ↓
[完全アクティブ] → 通常動作（記事閲覧・将来のチャット等すべて可）
```

### 4-2. 言語切替の副作用

- 初回モーダル選択時: `localStorage["preferred_language"] = "ja"|"en"|"tl"`
- ログイン中: `localStorage` + `profiles.preferred_language` を同期。サーバー優先（複数デバイスで一貫させる）
- 切替操作: ヘッダーの言語スイッチャー → クライアント側で URL ロケール変更（`router.replace`）+ `localStorage` 更新 + `/api/profile/me` PATCH
- リアルタイム反映: Server Component は新しい URL の locale を参照して再描画される（Next.js 16 の `setRequestLocale` 経由）

### 4-3. 冪等性

- `/api/consent`: 同一 `(user_id, document_type, version)` への二重 POST は 200 で early return（**INSERT ON CONFLICT (user_id, document_type, version) DO NOTHING** で実装）
- `/api/profile/onboard`: `onboarded_at` が既に非 NULL なら 409 Conflict（既にオンボーディング済み、再実行はクライアントバグ）
- `/api/profile/me PATCH`: idempotent（最終的な値が反映されればよい）

---

## 5. トランザクション境界

| 処理 | TX 範囲 | 失敗時 |
|---|---|---|
| Facebook OAuth callback | auth.users 作成 → handle_new_user trigger → profiles 作成 | trigger 失敗時は auth 全体ロールバック（既存スキーマで実装済み） |
| `/api/profile/onboard` | (a) profiles UPDATE と (b) `onboarded_at = NOW()` 設定を同一 TX | UPDATE 失敗で 500、状態は変わらない |
| `/api/consent` | INSERT ON CONFLICT のみ、単一行操作 | DB エラー時は 500、Sentry 送信 |
| 言語切替 | localStorage 更新 + `/api/profile/me PATCH` の2つは独立、片方失敗してもよい（次回ログイン時にサーバー値で同期） | UI で警告 |

---

## 6. 認可ポリシー（最重要）

### 6-1. 認可レイヤー設計（H1 修正方針）

**現状（W1 後）**:
```
proxy.ts: /api/* と /admin/* は NextResponse.next() で素通し ← H1
```

**W2 修正方針**:
1. **proxy.ts はホワイトリスト方式の公開判定のみ**:
   - 公開パス（`/api/auth/callback`, `/api/messenger/webhook`, `/api/komoju/webhook`, ロケール付きランディング・記事 `/[locale]/(public)/**`, 利用規約・プラポリ静的配信）は素通し
   - それ以外（`/api/*`, `/admin/*`, `/[locale]/(authed)/**`）は **`proxy.ts` で session を取得し、未認証ならリダイレクトまたは 401**
2. **API ルートは Route Handler 内で個別ガード**:
   - `requireAuth(req)` → session 取得、未認証なら `Response.json({error: UNAUTHORIZED}, 401)`
   - `requireOnboarded(profile)` → `onboarded_at` チェック、未完了なら `403 FORBIDDEN`
   - `requireConsent(profile)` → 最新版同意チェック、未済なら `412 STALE_CONSENT`
   - `requireAdmin(profile)` / `requireEditor(profile)` → admin_roles チェック
3. **Server Component / Page は server-side guard**:
   - `app/[locale]/(authed)/layout.tsx` で `getSession()` を取得し、未認証ならログインへ `redirect()`
   - `(authed)` route group 内の page は session 前提

### 6-2. 認可マトリクス（W2 範囲）

「Pay flag」列は `NEXT_PUBLIC_PAYMENT_ENABLED=true` のときのみ追加でチェックすることを示す（W2 ではすべての行で false 想定、追加チェック無効）。

| ルート | 公開 | session 必要 | 同意必要 | onboard 必要 | admin | Pay flag |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `/[locale]` (ランディング) | ✓ | | | | | |
| `/[locale]/articles/*` | ✓ | | | | | |
| `/[locale]/restaurants/*` | ✓ | | | | | |
| `/[locale]/legal/*` | ✓ | | | | | |
| `/[locale]/login` | ✓ | | | | | |
| `/[locale]/consent` | | ✓ | | | | |
| `/[locale]/onboard` | | ✓ | ✓ | | | |
| `/[locale]/chat` (W5 で実装) | | ✓ | ✓ | ✓ | | △ |
| `/[locale]/settings` | | ✓ | ✓ | ✓ | | |
| `/[locale]/inquiry/*` (W5) | | ✓ | ✓ | ✓ | | |
| `/[locale]/subscription` (W7+) | | ✓ | ✓ | ✓ | | ✓ |
| `/admin/*` | | ✓ | ✓ | ✓ | ✓ | |
| `/api/auth/callback` | ✓ | | | | | |
| `/api/messenger/webhook` | ✓ | | | | (内部署名検証) | |
| `/api/profile/me` GET | | ✓ | | | | |
| `/api/profile/me` PATCH | | ✓ | ✓ | | | |
| `/api/profile/onboard` | | ✓ | ✓ | | | |
| `/api/consent` | | ✓ | | | | |
| `/api/consent/me` | | ✓ | | | | |
| `/api/admin/*` | | ✓ | ✓ | ✓ | ✓ | |
| `/api/komoju/webhook` (W7+) | ✓ | | | | (内部署名検証) | ✓ |
| `/api/subscriptions/*` (W7+) | | ✓ | ✓ | ✓ | | ✓ |

**△ チャット**: flag false のときは Welcome Trial / 月3回制限を適用しない（無制限利用）。flag true のときはプランファイル §6-2 のフローを適用。

### 6-3. テナント越境防止

- 全テーブルの RLS で `auth.uid() = user_id` を必ず検証（W1 で実装済み）
- API ルートは service_role 経由で操作する場合、必ず `auth.uid()` を引数に取って `user_id` フィルタする
- 横断的なテスト: 別ユーザーのトークンで他人の `profile_id` をパスに入れて 403 が返ることを E2E で検証

### 6-4. /admin/* の管理者判定ロジック

```ts
// lib/auth/require-admin.ts
export async function requireAdmin(): Promise<{ user: User; role: 'admin' | 'editor' }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, 'UNAUTHORIZED');

  const { data: roleRow } = await supabase
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!roleRow) throw new HttpError(403, 'FORBIDDEN');
  return { user, role: roleRow.role };
}

export async function requireEditor() {
  const result = await requireAdmin();  // editor も admin 権限を持つ
  if (result.role !== 'admin' && result.role !== 'editor') {
    throw new HttpError(403, 'FORBIDDEN');
  }
  return result;
}

// オペレーター介入は admin 限定（プランファイル §8 認可表より）
export async function requireOperatorRole() {
  const result = await requireAdmin();
  if (result.role !== 'admin') throw new HttpError(403, 'FORBIDDEN');
  return result;
}
```

**初期管理者の登録方法（W2 セットアップ手順）**:
1. ユーザー（運営者本人）が Facebook OAuth でログイン
2. Supabase ダッシュボードから手動で SQL: `INSERT INTO admin_roles (user_id, role) VALUES ('<your-uuid>', 'admin');`
3. 以降は管理画面の `/admin/users` から他のロール付与可能（W3 で実装）

### 6-5. Feature flag: NEXT_PUBLIC_PAYMENT_ENABLED

**経営判断**: リリース後しばらくは全機能無料。Komoju 本番審査を行わず、課金 UI/API も実装しない。

**flag の扱い**:

| flag 値 | デフォルト | アプリ動作 |
|---|:---:|---|
| `false` または未設定 | ✓ | 全ユーザー全機能無制限。Welcome Trial カウンタも無視。「無料開放中」バッジ常時表示。`/[locale]/subscription` ルートは 404 |
| `true` | | プランファイル §6-2 / §6-3 / §6-4 のフロー（trial/月3回制限/購入導線/Komoju webhook）を有効化 |

**実装規約**:
- `lib/payment/is-payment-enabled.ts` に1関数だけ用意し、すべての paywall 判定箇所はこれを参照する
- API ルート: flag false なら `requireConsent()` まではチェック、その後の plan/usage チェックは早期 return で全許可
- UI: `<PaymentEnabled>...</PaymentEnabled>` ラッパーコンポーネントで囲い、flag 依存の UI 要素を一括管理
- ヘッダー or 設定画面に **`<FreeTrialBadge />`** （flag false のとき表示、true で自動非表示）

**flag 切替時のチェックリスト**（W7 完了後 or 一定 MAU 達成時に実行する想定）:
1. Komoju 本番アカウント審査通過確認
2. Stripe Webhook → Komoju Webhook の url 設定（`https://app.novalis.ph/api/komoju/webhook`）
3. proxy.ts の公開ホワイトリストに `/api/komoju/webhook` を追加
4. 利用規約に「料金体系」セクションを追加した新バージョン発行
5. 全既存ユーザーへ規約改訂の再同意要求（既存の §1 Q3 フロー）
6. `NEXT_PUBLIC_PAYMENT_ENABLED=true` をプロダクションに設定
7. 月初の chat_usage カウンタを全員 0 リセット（lazy reset で問題ないが、明示）
8. ヘッダーから「無料開放中」バッジが消えることを確認

### 6-6. Cookie domain 設定

| 環境 | domain | 理由 |
|---|---|---|
| 本番 | `app.novalis.ph` 専用（subdomain 共有しない） | LP 経由の Cookie 漏洩リスク回避 |
| 開発 | `localhost` | デフォルト |
| プレビュー (Vercel) | `*.vercel.app` のデプロイ URL | プレビュー環境ごとに独立 |

**実装**: `lib/supabase/server.ts` の `createServerClient` の cookie option に下記:
```ts
const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
const cookieDomain = url.hostname === "localhost" ? undefined : url.hostname;
// → 本番: "app.novalis.ph"、開発: undefined
```

その他の Cookie 属性:
- `Secure: true`（本番）
- `HttpOnly: true`
- `SameSite: "Lax"`（OAuth リダイレクトで失われないように）

### 6-7. Facebook OAuth 設定

**Meta App 側の設定（ユーザー側作業）**:
- App Domains: `app.novalis.ph`
- Site URL: `https://app.novalis.ph`
- Valid OAuth Redirect URIs:
  - `https://app.novalis.ph/api/auth/callback` （本番）
  - `https://<vercel-preview-url>/api/auth/callback` （プレビュー、必要に応じ追加）
  - `http://localhost:3000/api/auth/callback` （開発）
- 必要 permission: `email`, `public_profile`（`pages_messaging` は W7 で別途）

**Supabase Dashboard 側の設定**:
- Auth → Providers → Facebook を有効化
- App ID, App Secret を入力
- Redirect URL を Supabase が自動生成する `https://<project-ref>.supabase.co/auth/v1/callback` を Meta App の OAuth Redirect URIs にも追加

**コード側**:
```ts
// app/[locale]/login/page.tsx
const supabase = createBrowserClient();
await supabase.auth.signInWithOAuth({
  provider: "facebook",
  options: {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
    scopes: "email,public_profile",
  },
});
```

### 6-8. CORS

**結論**: W2 では CORS 設定不要。

理由:
- LP（`novalis.ph`）と本サービス（`app.novalis.ph`）はリンク遷移のみで通信しない
- LP から `app.novalis.ph` の API を fetch する用途は現状無し
- 将来必要になったら、Next.js Route Handler で `Access-Control-Allow-Origin: https://novalis.ph` を許可する形で追加

---

## 7. 異常系シナリオ（最低5つ → 8つ書く）

### S1. 同意撤回（規約変更時の再同意拒否）

**シナリオ**: ユーザーが規約改訂版に再同意を拒否する。
**影響**: 過去の同意は法務記録に残るが、サービスは継続利用不可になる。
**対処**:
- 同意拒否時は AI チャット・エスカレ等の能動アクションを 412 STALE_CONSENT で拒否
- 記事閲覧は引き続き許可（過去の規約での閲覧契約は有効）
- ユーザーがアカウント削除を要求した場合、`/settings/delete-account` から実行可能（W2 では UI のみ、実削除フローは Phase 2）

### S2. 複数言語切替時の state 破壊

**シナリオ**: ユーザーが日本語でフォーム入力中に英語に切替、URL の locale が変わると Server Component が再レンダリングされて入力が消える。
**対処**:
- フォーム入力中は言語切替ボタンに `confirm()` ダイアログ「入力内容が失われます。続行しますか？」
- フォームを React state に保存し、URL ロケール変更後も保持する設計を Server Action ベースで設計（W2 では設計のみ、実装は実機検証で）
- **代替案**: フォーム画面では言語スイッチャーを非表示にする（よりシンプル、推奨）

### S3. 初回モーダルのスキップ攻撃

**シナリオ**: 攻撃者が `localStorage["preferred_language"]` を直接書き込んで初回モーダルをスキップ、そのまま `/[locale]/onboard` にアクセスする。
**影響**: 認証は別レイヤーなので、ログインしていなければ `redirect('/login')`、ログイン済なら通常フロー継続。実害なし。
**対処**: localStorage は UX 用の保存に過ぎず、サーバー側の認可・状態は session/profiles に依存する。攻撃ベクトルとして無効化されている。**ただし** `preferred_language` は最終的に `profiles.preferred_language` に同期されるので、不正な値が入らないよう Zod で `enum(['ja','en','tl'])` 検証必須。

### S4. Facebook OAuth コールバックでの permission denied

**シナリオ**: ユーザーが Facebook ログイン画面で「キャンセル」を押す、または email permission を拒否する。
**対処**:
- Supabase Auth が error redirect URL に `?error=access_denied` を付けて返す
- `/api/auth/callback` で error クエリを検知し、`/login?error=fb_denied` にリダイレクト
- ログイン画面で「Facebook の許可をキャンセルされたため、ログインできませんでした」を表示

### S5. handle_new_user trigger 失敗

**シナリオ**: profiles INSERT 時に何らかの DB エラー（例: 一時的接続切断）。
**影響**: auth.users と profiles の不整合（auth.users は作られたが profiles なし）。
**対処**:
- W1 の trigger は SECURITY DEFINER + 既定値（空文字 prefecture_code 等）で確実に成功するよう設計済み
- それでも失敗した場合、`/api/profile/me` GET で profiles が見つからなければ trigger 相当の処理を補完する `ensureProfile()` ヘルパーを実装
- `ensureProfile()` は INSERT ON CONFLICT DO NOTHING で冪等

### S6. 規約バージョン管理の不整合

**シナリオ**: コード上の `CURRENT_TERMS_VERSION` を更新したが、`public/legal/terms/<new-version>/{ja,en,tl}.md` を配置し忘れた。
**影響**: 同意画面で規約本文が 404、ユーザーが同意できなくなる。
**対処**:
- ビルド時バリデーション: `lib/legal/versions.ts` の値に対応するファイルが存在するか確認するスクリプトを `package.json scripts.prebuild` に追加
- E2E テスト: 同意画面の各言語タブで規約本文が表示されることを必須化

### S7. 同意ログの二重 INSERT（race condition）

**シナリオ**: ユーザーがダブルクリックで同意ボタンを連打、`/api/consent` が並列に複数飛ぶ。
**対処**:
- `INSERT INTO consent_logs ... ON CONFLICT (user_id, document_type, version) DO NOTHING` で冪等化
- UNIQUE 制約: `UNIQUE(user_id, document_type, version)` を migration 002 で追加

### S9. Feature flag 切替（false → true）

**シナリオ**: 数ヶ月後 `NEXT_PUBLIC_PAYMENT_ENABLED=false → true` に切替える時、既存ユーザー全員のチャット履歴・Trial 期限・カウンタが急に paywall に当たる。

**影響**:
- Trial 期限切れ（登録 30 日以上経過）のユーザーは即時 4 回目以降を拒否される
- 「無料だったのに突然有料化された」と SNS で反発される可能性

**対処**:
1. flag 切替の **少なくとも 30 日前**に利用規約改訂版を発行し、料金体系セクションを追記
2. 全ユーザーに再同意要求（既存 §1 Q3 のフロー）— 同意しないユーザーは従来通り無料閲覧のみ可能
3. flag 切替時に **`profiles.trial_started_at = NOW()` を全員一斉 UPDATE**（migration スクリプトで実行）→ 切替日から 30 日間は全員無料 Trial 扱いにし、ソフトランディング
4. ヘッダーバナー「○月○日から有料化します。詳しくはこちら」を切替 14 日前から表示

**W2 で実装すべきこと**:
- flag false 時に Welcome Trial カウンタを表示しない（混乱防止）
- flag 切替時の再 trial 発動が可能になるよう、`profiles.trial_started_at` の UPDATE 権限は service_role のみに限定（既に RLS で保護済み）

### S8. 利用規約改訂時の既存ユーザー大量同時アクセス

**シナリオ**: 規約改訂版をリリースした直後、全ユーザーがログインして再同意画面が一斉に出る。`/api/consent` POST が殺到。
**対処**:
- レートリミット 10/min はセッション単位なので問題なし
- DB 負荷: Supabase の通常負荷の範囲内（`consent_logs` への INSERT は軽量）
- UX: 再同意画面で「規約改訂のサマリー（変更点 3-5 行）」を見せて、ユーザーが安心して同意できるようにする

---

## 8. パフォーマンス想定

| 指標 | 目標 |
|---|---|
| ログイン後の初回レンダリング (P50) | 1.5 秒以内 |
| `/api/profile/me` GET (P50) | 200ms 以内 |
| `/api/consent` POST (P50) | 100ms 以内 |
| `/api/profile/onboard` POST (P50) | 200ms 以内 |
| 同意・オンボーディング画面の Cumulative Layout Shift | < 0.1 |
| 想定 QPS | ピーク 10 req/s（MAU 3,000 想定の 1% 同時稼働） |

**N+1 防止**:
- `/api/profile/me` で profile + 最新 consent_logs（terms/privacy）を1クエリで取得（join または 2 クエリ並列）
- 規約バージョン比較は in-memory 定数で行い、DB 不要

---

## 9. テスト方針

### 9-1. ユニットテスト

| 対象 | テスト |
|---|---|
| `lib/auth/require-*.ts` | session ない / admin_roles ない / role が editor / role が admin の各パターン |
| `lib/legal/versions.ts` | semver パース、バージョン比較関数 |
| `lib/i18n/*` | 既に W1 で動作確認済み、追加テスト不要 |

### 9-2. 統合テスト

| 対象 | テスト |
|---|---|
| `/api/profile/me` GET/PATCH | 未認証 401 / 他人のリソース不可 / 自分は可 |
| `/api/profile/onboard` POST | 二重実行 409 / 不正な prefecture_code 400 / 正常 200 |
| `/api/consent` POST | 冪等性（二重 POST で同じ結果）/ 不正な document_type 400 |
| Facebook OAuth callback | 正常 / error=access_denied / state mismatch |

### 9-3. RLS テスト（pgtap）

```sql
-- profiles: 本人のみ SELECT/UPDATE
SELECT plan(6);
-- ユーザーAでログイン → ユーザーA自身は SELECT 可
-- ユーザーAでログイン → ユーザーBの profile を SELECT 不可
-- ユーザーAでログイン → ユーザーAの profile を UPDATE 可
-- ユーザーAでログイン → ユーザーBの profile を UPDATE 不可
-- 匿名 → 全件 SELECT 不可
-- 匿名 → INSERT 不可

-- consent_logs: UPDATE/DELETE ポリシーなし → 誰も更新削除できない
-- ユーザーAでログイン → 自分の consent_logs を UPDATE 試行 → 0 行影響（成功扱いだが変更なし）
-- 匿名 → SELECT 不可
```

### 9-4. E2E テスト（Playwright）

| シナリオ | フロー |
|---|---|
| 新規登録ゴールデンパス | ランディング → 言語選択（タガログ）→ ログイン（Facebook テスト User） → 同意画面（terms + privacy 両方）→ オンボーディング（東京都, 渋谷区）→ ホーム |
| 同意拒否 | ログイン後 → 同意画面で離脱 → ホームアクセス試行 → 同意画面に強制戻り |
| 言語切替 | ja でログイン → 設定で en に変更 → URL が `/en/*` に、UI が英語に |
| Admin アクセス | 一般ユーザーで `/admin` → 403 / admin_roles を Supabase で付与 → `/admin` アクセス成功 |

### 9-5. カバレッジ範囲外（明示）

- Facebook OAuth Provider 内部の挙動（モック使用）
- Supabase Auth の内部実装
- 利用規約本文の翻訳品質（弁護士監修で別途担保）

---

## 10. 未確定事項

### 解決済み（2026-05-07）
- ~~Cookie domain~~ → `app.novalis.ph` 専用に確定（§6-6）
- ~~Komoju 本番審査~~ → 当面行わない、`NEXT_PUBLIC_PAYMENT_ENABLED=false` で全機能無料開放（§6-5）

### 残る未確定事項
1. **Facebook OAuth permission**: `email` permission を必須にするか任意にするか（任意でも `profiles.email` は NULL 許容済み）
2. **管理者初期登録の手順**: Supabase ダッシュボードから手動 SQL で良いか、それとも CLI スクリプト化するか
3. **規約改訂時のサマリー表示**: 規約改訂で「変更点要約」を専用テーブル or markdown front-matter で持つか
4. **Sentry のデータマスキング**: ユーザー発話・PII を Sentry に送らない設定（`beforeSend` で除去）の具体的フィルター条件
5. **言語スイッチャーをフォーム画面で非表示にするか**: S2 の対処で「非表示にする」を推奨したが、UX 観点で要確認
6. **Feature flag 切替タイミング**: W7 完了後 vs 一定 MAU 達成後（例: MAU 1,000 以上）vs 経営判断のみ
7. **「無料開放中」バッジのコピー**: 3言語版でどう書くか（ja「無料開放中」/ en「Free during launch」/ tl「Libre sa launch period」 等）

---

## 設計フェーズ完了基準

- [x] 1. 機能仕様の確認と曖昧点の質問（3つ）
- [x] 2. データモデル
- [x] 3. API契約（Zod スキーマ + エラーケース）
- [x] 4. 状態遷移と副作用（冪等性含む）
- [x] 5. トランザクション境界
- [x] 6. 認可ポリシー（テナント越境防止 + 管理者判定）
- [x] 7. 異常系シナリオ（8つ）
- [x] 8. パフォーマンス想定
- [x] 9. テスト方針
- [x] 10. 未確定事項

---

*本文書はユーザー承認後に W2 実装フェーズに入ります。実装中に新たな曖昧点が発見されたら本文書に追記し、設計の整合性を保ちます。*
