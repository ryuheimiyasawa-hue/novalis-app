# W3 Phase 1 設計フェーズ文書

準拠: `~/.claude/CLAUDE.md` Part 2.1（設計フェーズ実装前必須項目10）
作成日: 2026-05-11
ステータス: **承認待ち**（実装着手は本文書承認後）
W3 のリリース計画上の位置: プランファイル §12 W3「データモデル + 管理画面骨格」+ 公開閲覧UI

---

## 0. W3 のスコープ（実装する機能）

W3 は **コンテンツ機能の骨格**。AI チャット (W4-W5) が依拠する記事・FAQ・士業データを管理 → 公開する基盤を作る。

### 0-1. 含めるもの

1. **管理画面 layout** (`/admin/*`)：admin 認証ガード、ナビゲーション、shadcn/ui base
2. **カテゴリ CRUD**：admin で管理、公開閲覧でフィルタ
3. **記事 CRUD**：admin で markdown 入力、公開閲覧で記事ページ
4. **FAQ CRUD**：admin で Q/A 入力、公開閲覧で FAQ 一覧
5. **士業 CRUD**：admin で名簿管理（B-5 で投入したダミーを編集できる状態に）
6. **公開閲覧 UI** (`/[locale]/articles`, `/[locale]/faqs`, `/[locale]/categories/[slug]`, `/[locale]/experts`)：3言語対応、SSG ベース
7. **カテゴリフィルタ**：記事 / FAQ / 士業をカテゴリ別に絞り込み

### 0-2. 含めないもの（W4 以降）

- ❌ pgvector embedding 自動生成 → **W5 RAG** で記事の published 時に batch 生成
- ❌ AI チャットからの記事リンクプレビュー → **W5**
- ❌ Whitelist 個別性検知 → **W4**
- ❌ Gemini 連携 → **W4**
- ❌ 記事の auto-save / draft 同期 → 明示 save ボタン方式（複雑性 vs 価値で判断）
- ❌ ユーザー側の記事コメント / いいね → MVP スコープ外（Phase 2）
- ❌ rich text エディタ（WYSIWYG）→ markdown textarea で十分

### 0-3. ユーザー指示由来の確定事項（2026-05-11）

- **記事は当面、自社作成中心**（外部ライター発注は将来）
- **初期コンテンツ目標**：ベータ開始時に最低 10〜20 記事
- **W3-W5 を MVP に含む**（Bot は Phase 2 に分離済み）

---

## 1. 機能仕様の確認と曖昧点の質問（最低3つ）

### Q1. 管理画面（/admin/*）の表示言語は？

**選択肢**:
- (a) 日本語 only：運用者は日本人想定、最速実装
- (b) 英語 only：将来海外運用者参加を想定、UI 開発で next-intl 不要
- (c) 3言語対応：エンドユーザー側と同じ next-intl 配下にする

**推奨**: **(a) 日本語 only**。運用者は宮澤さん本人 + 数名の協業企業（フィリピン人ネットワーク）想定。3言語化はオーバーヘッド大、後で必要時に next-intl 化可能。`/admin/*` は `[locale]` の外に配置（既に B-1 で route group 分離済）。

### Q2. 記事 body の入力 / 表示方法は？

**選択肢**:
- (a) markdown textarea + react-markdown プレビュー：W3-B-3 の規約閲覧と同パターン、シンプル
- (b) WYSIWYG (TipTap / Lexical 等)：UX 良いが実装重い、依存追加
- (c) MDX：React component を埋め込めるが管理者コスト高い

**推奨**: **(a) markdown textarea + react-markdown プレビュー**。AI 生成下書き（後で）も markdown 形式が扱いやすい。プレビューは編集画面の右半分に常時表示。

### Q3. 記事 status 状態遷移は？

**選択肢**:
- (a) draft / published のみ：シンプル
- (b) draft / published / archived（既存 schema CHECK に含む）：将来の保留・取下げに対応

**推奨**: **(b) draft / published / archived**。schema は既に CHECK 制約で 3値許可。archived は公開閲覧で非表示、admin では「アーカイブ済」フィルタで閲覧可能。

### Q4. カテゴリ階層は？

**確定**: **フラット**（migration 001 で `categories.parent_id` なし）。サブカテゴリは将来。

### Q5. 記事のロケール対応はどう実装？

**選択肢**:
- (a) 1 つの articles レコードで `body_ja / body_en / body_tl` の3カラム所持（migration 001 の現スキーマ）
- (b) ロケールごとに別レコード + parent_id で結ぶ

**確定**: **(a) 3カラム持ち**（既存スキーマそのまま）。記事編集画面でタブ切替（ja/en/tl）。en/tl が空のロケールでは ja にフォールバック表示。

---

## 2. データモデル

### 2-1. 既存テーブル（migration 001 / 002 で作成済）

```sql
categories (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_ja TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_tl TEXT NOT NULL,
  icon TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
-- W1 で 7 カテゴリ seed 済み (visa / social_ins / family / school / admin_proc / escalation / restaurants)

articles (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES categories(id),
  slug TEXT UNIQUE NOT NULL,
  status TEXT CHECK (status IN ('draft', 'published', 'archived')),
  title_ja TEXT NOT NULL,
  title_en TEXT,
  title_tl TEXT,
  body_ja TEXT NOT NULL,
  body_en TEXT,
  body_tl TEXT,
  prefecture_code TEXT,
  city_name TEXT,
  author_id UUID REFERENCES profiles(id),
  published_at TIMESTAMPTZ,
  created_at, updated_at
)

faqs (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES categories(id),
  question_ja TEXT NOT NULL,
  question_en TEXT, question_tl TEXT,
  answer_ja TEXT NOT NULL,
  answer_en TEXT, answer_tl TEXT,
  prefecture_code TEXT,
  is_published BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at, updated_at
)

experts (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  specialty_ja TEXT, specialty_en TEXT, specialty_tl TEXT,
  bio_ja TEXT, bio_en TEXT, bio_tl TEXT,
  prefecture_code TEXT,
  city_name TEXT,
  avatar_url TEXT,
  calendar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

admin_roles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('admin', 'editor')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
)
```

### 2-2. 追加 migration の必要性

**migration 003 は不要**。既存スキーマで W3 機能を全カバー可能。

ただし **W5 で content_embeddings に対する INSERT トリガー or batch script** が必要になる。これは W5 設計時に判断。

### 2-3. インデックス

既に migration 001 で以下を作成済み:
- `idx_articles_status`
- `idx_articles_category`
- `idx_articles_pref_status`
- `idx_faqs_category`、`idx_faqs_published`
- `idx_experts_active`、`idx_experts_pref_active`

W3 で追加するもの: なし。

---

## 3. API契約

### 3-1. 公開 API（認証不要、proxy.ts ホワイトリスト追加）

| ルート | メソッド | 概要 | レートリミット |
|---|---|---|---|
| `/api/articles` | GET | 記事一覧（query: `category_slug`, `prefecture_code`, `q`, `page`, `locale`） | 60/min |
| `/api/articles/[slug]` | GET | 記事詳細 | 60/min |
| `/api/faqs` | GET | FAQ一覧（query: `category_slug`, `q`） | 60/min |
| `/api/experts` | GET | 士業一覧（query: `prefecture_code`） | 60/min |
| `/api/categories` | GET | カテゴリ一覧 | 60/min |

**注意**: これらは現状 (proxy.ts) で `/api/*` 全部認証必須に倒している。**proxy.ts のホワイトリストに追加するか、route 内で「公開 GET」を判定するか**を判断必要。

**推奨**: proxy.ts の PUBLIC_API_PATHS に上記を追加（method 関係なく全て GET なので安全）。

### 3-2. 管理者 API（`/api/admin/**`、`requireEditor()` 以上）

| ルート | メソッド | 認可 | 概要 |
|---|---|---|---|
| `/api/admin/categories` | GET | requireEditor | カテゴリ一覧 |
| `/api/admin/categories` | POST | requireAdmin | 新規カテゴリ追加（admin のみ、構造変更扱い） |
| `/api/admin/categories/[id]` | PATCH | requireAdmin | カテゴリ更新 |
| `/api/admin/categories/[id]` | DELETE | requireAdmin | カテゴリ削除（記事 FK 制約あり） |
| `/api/admin/articles` | GET | requireEditor | 記事一覧（draft/published/archived 全て） |
| `/api/admin/articles` | POST | requireEditor | 記事新規作成（status=draft） |
| `/api/admin/articles/[id]` | GET | requireEditor | 記事詳細（編集用） |
| `/api/admin/articles/[id]` | PATCH | requireEditor | 記事更新 |
| `/api/admin/articles/[id]` | DELETE | requireAdmin | 記事削除（admin 限定） |
| `/api/admin/faqs` | GET/POST | requireEditor | FAQ 一覧・新規 |
| `/api/admin/faqs/[id]` | PATCH | requireEditor | FAQ 更新 |
| `/api/admin/faqs/[id]` | DELETE | requireAdmin | FAQ 削除 |
| `/api/admin/experts` | GET/POST | requireEditor | 士業一覧・新規 |
| `/api/admin/experts/[id]` | PATCH | requireEditor | 士業更新 |
| `/api/admin/experts/[id]` | DELETE | requireAdmin | 士業削除 |

**規則**: 削除は admin 限定（editor は誤削除リスク）、参照・編集は editor 以上。

### 3-3. リクエスト/レスポンス契約

- 全入力 Zod 検証
- レスポンスは `{ ok: boolean, data?: ..., error?: { code, message } }` 統一
- エラーコード: `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_INPUT`, `NOT_FOUND`, `CONFLICT`（slug 重複）, `RATE_LIMITED`, `INTERNAL_ERROR`

#### data の形状（C-7 確定）

公開 GET と admin GET の `data` 形状は意図的に異なる。「クライアントが本当に必要なもの」を優先し、一律ラッパー化はしない。

| エンドポイント | `data` の形 | 理由 |
|---|---|---|
| `/api/categories` | `Array<Category>` | 7-30件想定、ページネーション不要 |
| `/api/articles` (list) | `{ items: Article[], total, page, limit }` | 数百件規模、ページネーション必須 |
| `/api/articles/[slug]` | `Article` | 単一オブジェクト |
| `/api/faqs` | `Array<Faq>` | カテゴリ単位で全件返す方が UX 良い（sort_order 順の一括表示） |
| `/api/experts` | `Array<Expert>` | 数十件想定 |
| `/api/admin/{articles,categories,faqs,experts}` (list) | `Array<...>` | 内部運用、ページネーションは Phase 2 |
| `/api/admin/...` (detail/create/update) | 単一オブジェクト |  |
| `/api/admin/...` (DELETE) | `{ id }` | 削除済み id のみ返却 |

**Phase 2 検討**: クライアントは現状 `Array.isArray(json.data)` で識別できるが、FAQ/experts もページネーション化される可能性があるため、ラッパー型 `{ items, total, page, limit }` への統一を将来検討する。当面は本表を契約とする。

#### Slug 命名規則（C-7.fix 確定）

`SlugSchema` は `^[a-z0-9]+(?:[_-][a-z0-9]+)*$`（lowercase 英数 + `_` または `-` 区切り）を許可する。

- 既存 seed slugs に `social_ins` `admin_proc` がアンダースコア表記で存在
- 入力 validation の責務は「DB に格納されている値を受け入れられること」
- 新規作成時は kebab-case を推奨するが schema レベルでは強制しない
- 統一したくなったら migration 04 で `UPDATE categories SET slug = REPLACE(slug, '_', '-')`（system category guard を一時解除する必要あり）

### 3-4. 主要 Zod スキーマ例

```ts
// 記事 Insert
const ArticleInsertSchema = z.object({
  category_id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  title_ja: z.string().min(1).max(200),
  title_en: z.string().max(200).optional(),
  title_tl: z.string().max(200).optional(),
  body_ja: z.string().min(1),
  body_en: z.string().optional(),
  body_tl: z.string().optional(),
  prefecture_code: z.string().regex(/^JP-\d{2}$/).optional(),
  city_name: z.string().max(100).optional(),
});
```

---

## 4. 状態遷移と副作用

### 4-1. 記事の状態遷移

```
[新規作成] → [draft]
              ↓ admin が "公開" クリック
            [published] (published_at = NOW())
              ↓ admin が "アーカイブ"
            [archived]
              ↓ admin が "下書きに戻す"
            [draft]
              ↓ admin が "削除"
            [削除] (DB から物理削除)
```

### 4-2. published 時の副作用（W3 範囲）

- `published_at` を `NOW()` でセット（NULL の場合のみ）
- すでに published で再 publish 押下時: `published_at` は変えない（最初の公開日を保持）

### 4-3. published 時の副作用（W5 範囲、W3 では実装しない）

- `content_embeddings` テーブルに記事の各言語 chunk を embedding 保存（pgvector）
- W3 ではフックポイントだけ用意（コメントで TODO）

### 4-3-bis. ISR キャッシュ無効化 (補足指示 A)

公開閲覧 UI は ISR (`revalidate: 60`) でキャッシュされるため、admin 操作後に明示的に `revalidatePath()` を呼び出して即時反映する。**呼び忘れ防止のためヘルパー関数化**:

```ts
// apps/v2/src/lib/cache/revalidate-content.ts
import { revalidatePath } from "next/cache";
import { routing } from "@/lib/i18n/routing";

export function revalidateArticle(slug: string, categorySlug?: string) {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/articles`);
    revalidatePath(`/${locale}/articles/${slug}`);
    if (categorySlug) revalidatePath(`/${locale}/categories/${categorySlug}`);
  }
}

export function revalidateFaq(categorySlug?: string) {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/faqs`);
    if (categorySlug) revalidatePath(`/${locale}/categories/${categorySlug}`);
  }
}

export function revalidateExpert() {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/experts`);
  }
}

export function revalidateCategory(slug: string) {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/articles`);
    revalidatePath(`/${locale}/faqs`);
    revalidatePath(`/${locale}/categories/${slug}`);
  }
}
```

**呼出ルール**:
- 記事 publish / archive / delete / category_id 変更 → `revalidateArticle(slug, oldCategorySlug)` + 必要なら `revalidateArticle(slug, newCategorySlug)`
- FAQ publish / delete → `revalidateFaq(categorySlug)`
- 士業 update / delete → `revalidateExpert()`
- カテゴリ update / delete → `revalidateCategory(slug)`

実装ファイル各 route handler のレスポンス return 直前に呼ぶ。ルール違反は code review で必ず指摘。

### 4-4. カテゴリ削除の副作用

- `articles.category_id` が FK 参照しているため、デフォルトでは削除不可（PostgreSQL がエラー返す）
- 対応: admin 画面で削除前に「このカテゴリの記事 N 件を別カテゴリに移動してください」と案内

---

## 5. トランザクション境界

| 処理 | TX 範囲 | 失敗時 |
|---|---|---|
| 記事 publish (draft → published) | (a) status 更新 と (b) published_at セット を同一 TX | 部分失敗で整合性破壊しない |
| FAQ 並び替え (sort_order 一括 UPDATE) | 全 FAQ の sort_order 更新を1 TX | drag&drop 中の race を防ぐ |
| 記事削除 | 単一 DELETE。admin_roles・author_id 等の参照は ON DELETE SET NULL で連鎖 | 単純 |

---

## 6. 認可ポリシー

### 6-1. ロール別権限

| 操作 | anon | authenticated | editor | admin |
|---|:---:|:---:|:---:|:---:|
| 公開 GET（記事/FAQ/士業/カテゴリ閲覧） | ✓ | ✓ | ✓ | ✓ |
| 管理画面 access | | | ✓ | ✓ |
| 記事/FAQ/士業 CRUD（削除以外） | | | ✓ | ✓ |
| カテゴリ作成 | | | | ✓ |
| カテゴリ更新 | | | | ✓ |
| 削除（記事/FAQ/士業/カテゴリ） | | | | ✓ |
| admin_roles 管理 | | | | ✓ |

### 6-2. 実装

- `/admin/*` レイアウト：`requireEditor()` をブロック
- 削除系 API：`requireAdmin()` を route 内で呼ぶ
- カテゴリ作成・更新：`requireAdmin()`
- 公開 GET API：proxy.ts のホワイトリストに追加

### 6-3. RLS との関係

- `articles` `faqs` `experts` `categories` の RLS は migration 001 で「published / active なら anon でも SELECT 可」「admin_roles 経由で全アクセス」と設定済
- admin API は service_role を使うので RLS バイパス可能（既に B-1 の `getAdminClient()` 利用パターン）

---

## 7. 異常系シナリオ（最低5つ → 8つ書く）

### S1. slug 重複

**シナリオ**: 別記事と同じ slug で POST。
**影響**: PG 23505 unique_violation。
**対処**: route で `error.code === '23505'` を捕捉して 409 CONFLICT（"このスラッグは既に使われています"）。

### S2. 記事カテゴリが削除済

**シナリオ**: 記事 PATCH で存在しないカテゴリ ID を指定。
**対処**: route 内で先に SELECT 確認、なければ 400 INVALID_INPUT（"カテゴリが見つかりません"）。

### S3. 同時編集（楽観的ロック未実装）

**シナリオ**: 2人の editor が同記事を同時に PATCH → 後勝ち。
**対処**: MVP では受容（運用者は数名想定で衝突確率低い）。Phase 2 で `version` カラム + If-Match ヘッダで対応検討。**未確定事項に記載**。

### S4. 公開 GET API への大量リクエスト

**シナリオ**: 公開 API は認証なし → DoS の余地。
**対処**: proxy.ts レイヤで IP 単位レートリミット（60/min）。Vercel + Cloudflare の標準保護も活用。

### S5. RLS 設定漏れによる draft 漏洩

**シナリオ**: anon が `/api/articles` で draft 記事を取得。
**対処**: route で `WHERE status = 'published'` を必ず付与。RLS でも `published` のみ anon 許可。**両層で防御**。テストで「anon が draft を取れないこと」を必ず検証。

### S6. published 解除後の cache stale

**シナリオ**: SSG された記事ページが残り、published → archived 後も表示される。
**対処**: 公開 GET 系は `revalidate: 60`（60秒 ISR）でキャッシュ短期化。admin の publish/archive 操作後は対応 path に対して `revalidatePath()` を呼ぶ。

### S7. 大きな記事 body の保存

**シナリオ**: 100KB の markdown を貼られる。
**対処**: PG 側は問題なし、Zod で `body_ja: z.string().max(200_000)` (200KB) を上限とする。それ以上は 400 INVALID_INPUT。

### S8. admin が自分の admin_roles を削除（W3 直接スコープ外、Phase 2 admin/users CRUD で扱う想定）

**シナリオ**: 唯一の admin が自分の admin role を消し、サービス管理不能に。
**対処**: admin_roles 削除時に「最後の admin である場合は拒否」のガード（W3 では admin_roles UI を実装しないので未対応、Phase 2 で対応）。

---

## 8. パフォーマンス想定

| 指標 | 目標値 | 根拠 |
|---|---|---|
| 公開記事一覧 GET (P50) | 300ms 以内 | DB 1往復 + ページネーション 20件 |
| 公開記事詳細 GET (P50) | 200ms 以内 | DB 1往復 |
| 公開記事一覧 ISR cache | 60秒 | revalidate 60 |
| 管理画面記事一覧 GET (P50) | 500ms 以内 | DB 1往復 + 全件 (filter なしで最大100件想定) |
| 管理画面記事 PATCH (P50) | 400ms 以内 | DB 1往復 + revalidatePath() |
| 想定 QPS | ピーク 5 req/s | MAU 1,000 想定の 1% 同時稼働 |

**N+1 防止**:
- 記事一覧で `category:categories(id, slug, name_ja, name_en, name_tl)` を join で取得
- 士業一覧で同様

**キャッシュ戦略**:
- 公開 GET: ISR 60秒
- 管理画面: cache: 'no-store'

---

## 9. テスト方針

| 層 | テスト | カバレッジ目標 |
|---|---|---|
| ユニット | Zod スキーマ、slug バリデーション、status 遷移ロジック | 80% |
| 統合 | admin API ルート × Supabase（実 DB）| 主要ルート全部 |
| RLS | pgtap で「anon は draft 見えない」「editor は admin_roles 触れない」「admin は全部触れる」 | 全テーブル |
| E2E | Playwright で「admin login → 記事作成 → published → 公開ページで表示確認」の golden path | 1本以上 |

**カバレッジ範囲外として明示**:
- shadcn/ui コンポーネント自体の挙動（外部ライブラリ）
- markdown レンダリング揺れ（react-markdown 任せ）
- ISR キャッシュの正確性（Vercel 任せ）

### 9-bis. テスト優先順位（補足指示 E、時間制約時）

時間に追われた場合、以下の優先順序で実装。下位は次フェーズに繰越し可:

| 優先 | 種類 | 理由 |
|:---:|---|---|
| **1** | **RLS テスト**（pgtap） | セキュリティ核心、anon が draft 取れない / editor が admin_roles 触れない / admin が全アクセス を必ず検証 |
| **2** | ユニットテスト（Zod schema, status 遷移, slug regex） | API 契約の正しさ、回帰防止 |
| **3** | 統合テスト（admin API 主要ルート、create / list / publish / delete） | API ロジック確認 |
| **4** | E2E (Playwright) | 時間あれば admin → 公開のフルフロー1本、なければ手動検証で代替 |

**W3 完了承認の最低ライン**: 優先 1 + 2 を完遂すれば W3 完了承認可。3-4 は B-9 でまとめて整備可能。

---

## 10. 未確定事項

### 10-1. 設計判断必要（実装着手前に確定）

1. **Q1〜Q5 の回答確定**（推奨案で OK か、変更あるか）
2. **削除系 API を admin 限定にしてよいか**（editor も削除させるなら policy 再考）
3. **公開 GET API の proxy.ts ホワイトリスト追加可否**（または route 内判定で済ませるか）

### 10-2. 進行中に詰める

4. **shadcn/ui 追加コンポーネント** (補足指示 D に従い C-1 で確認):
   - 必要: Button / Card / Table / Dialog / Form / Input / Textarea / Select / Switch / Label / Badge / DropdownMenu / Toast (sonner)
   - インストール前チェック:
     - `components.json`（B-1 で配置済 / new-york / neutral / RSC: true）が shadcn 期待値と一致
     - `tailwind.config.*` の存在 / Tailwind v4 とのCSS 変数競合チェック（v4 では `@theme` ブロック）
     - `apps/v2/src/app/globals.css` の現在の CSS 変数（`--background` / `--foreground`）と shadcn 推奨セットの整合
     - `pnpm dlx shadcn@latest add <component>` 実行で自動追加される `@radix-ui/*` 依存が `package.json` に記録されること
   - 既存コンポーネント (login-form, onboarding-form, dashboard 等) との整合性: 現在は素の HTML + tailwind 直接、shadcn 化リファクタは W3 で全部やらず必要な所だけ
5. **markdown プレビュー** (補足指示 C):
   - B-3 で導入済の `react-markdown` を再利用（依存追加なし）
   - **明示する設定**:
     - `remark-gfm` を入れて GFM (テーブル / 自動リンク / 取り消し線 / タスクリスト) サポート
     - syntax highlight は MVP では不要（コードブロックは `<pre>` のまま）。Phase 2 で `rehype-highlight` 検討
     - `rehype-raw` は **使わない**（HTML allow すると XSS リスク、運用者が貼るとはいえ防御）
     - `<ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>` のように skipHtml を明示
   - 実装時に上記をコメントで残す
6. **記事の en/tl 自動翻訳**: 後で（W4 の Gemini を流用？ Phase 2 検討）
7. **AI 生成下書き機能**: 後で（W4-W5 の Gemini を編集画面に組み込む）

### 10-3. Phase 2 持ち越し

8. WYSIWYG エディタ（必要になったら TipTap 等）
9. 楽観的ロック（version カラム + If-Match）
10. admin/users 管理 UI（admin_roles の CRUD）
11. 自分が最後の admin かチェックして削除拒否

---

## 11. 実装ステップ案（W3 サブタスク）

| サブ | 内容 | 想定 |
|---|---|---|
| **C-1** | shadcn/ui base install + admin layout 骨格 | 1.5h |
| **C-2** | requireEditor() ガード、`/admin` route group + nav | 1h |
| **C-3** | カテゴリ CRUD (admin API + admin UI 一覧/編集) | 2h |
| **C-4** | 記事 CRUD (admin API + admin UI 一覧/編集 + markdown プレビュー) | 4h |
| **C-5** | FAQ CRUD (admin API + admin UI 一覧/編集) | 2h |
| **C-6** | 士業 CRUD (admin API + admin UI 一覧/編集) | 2h |
| **C-7** | 公開 GET API (`/api/articles`, `/api/faqs`, `/api/experts`, `/api/categories`) | 2h |
| **C-8** | 公開閲覧 UI (`/[locale]/articles`, etc.) — SSG + ISR 60s | 3h |
| **C-9** | カテゴリフィルタ + プレフェクチャフィルタ UI | 1.5h |
| **C-10** | テスト（unit + integration + RLS + E2E 1本） | 2h |
| **C-11** | typecheck/lint/build/test + 5役割監査 + commit 分割 | 1h |
| **合計** | | **~22h ≒ 1日** |

---

## 12. 主要ファイル一覧（実装で作成・変更する critical files）

### 新規作成

- `apps/v2/src/app/admin/layout.tsx` — requireEditor + nav
- `apps/v2/src/app/admin/page.tsx` — admin top
- `apps/v2/src/app/admin/{categories,articles,faqs,experts}/page.tsx` — 各リソース一覧
- `apps/v2/src/app/admin/{articles,faqs,experts}/new/page.tsx` — 各リソース新規作成
- `apps/v2/src/app/admin/{articles,faqs,experts}/[id]/page.tsx` — 各リソース編集
- `apps/v2/src/app/api/admin/{categories,articles,faqs,experts}/route.ts` — list / create
- `apps/v2/src/app/api/admin/{categories,articles,faqs,experts}/[id]/route.ts` — get / update / delete
- `apps/v2/src/app/api/{articles,faqs,experts,categories}/route.ts` — 公開 GET 一覧
- `apps/v2/src/app/api/articles/[slug]/route.ts` — 公開 GET 詳細
- `apps/v2/src/app/[locale]/(public)/articles/page.tsx` — 公開記事一覧
- `apps/v2/src/app/[locale]/(public)/articles/[slug]/page.tsx` — 公開記事詳細
- `apps/v2/src/app/[locale]/(public)/faqs/page.tsx` — 公開 FAQ
- `apps/v2/src/app/[locale]/(public)/categories/[slug]/page.tsx` — カテゴリ別一覧
- `apps/v2/src/app/[locale]/(public)/experts/page.tsx` — 公開士業一覧
- `apps/v2/src/components/ui/*.tsx` — shadcn 追加コンポーネント
- `apps/v2/src/components/admin/{nav,article-form,faq-form,expert-form,category-form}.tsx`
- `apps/v2/tests/unit/admin-articles-api.test.ts` — 主要 API テスト
- `apps/v2/tests/unit/article-schema.test.ts` — Zod schema テスト

### 既存変更

- `apps/v2/src/proxy.ts` — 公開 GET API をホワイトリスト追加
- `apps/v2/src/types/database.ts` — articles/faqs/experts/categories の Insert/Update 型を厳密化（Zod とミラー）
- `apps/v2/src/messages/{ja,en,tl}.json` — 公開閲覧 UI の文言追加（カテゴリ名は DB から、ボタンラベル等のみ）

---

## 13. 検証方法

1. **ローカル**: admin login → カテゴリ作成 → 記事作成（draft）→ プレビュー → 公開 → `/[locale]/articles` で表示確認
2. **Supabase**: pgtap で RLS テスト（anon が draft 見えない、editor が admin role 触れない、admin が全アクセス）
3. **Playwright E2E**: 上記の admin → 公開のフルフロー1本
4. **Sentry**: admin 操作時のエラーが Sentry に届く（B-7 の最小設定で動作確認）

---

## 設計フェーズ完了基準

- [x] 1. 機能仕様の確認と曖昧点の質問（5つ）
- [x] 2. データモデル
- [x] 3. API契約（Zod スキーマ + エラーケース）
- [x] 4. 状態遷移と副作用
- [x] 5. トランザクション境界
- [x] 6. 認可ポリシー（ロール別権限マトリクス + RLS との関係）
- [x] 7. 異常系シナリオ（8つ）
- [x] 8. パフォーマンス想定
- [x] 9. テスト方針
- [x] 10. 未確定事項

---

*本文書はユーザー承認後に W3 実装フェーズに入ります。実装中に新たな曖昧点が発見されたら本文書に追記し、設計の整合性を保ちます。*
