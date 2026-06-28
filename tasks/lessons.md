# Philippine Community v2 — 教訓ログ（lessons learned）

準拠: `~/.claude/CLAUDE.md` Part 1.3「自己改善ループ」
目的: 同種の指摘・失敗を繰り返さないためのパターン記録。
セッション開始時に必ず見直すこと。

---

## 2026-05-06 W1 スキャフォールド時の学び

### Lesson 1: pnpm workspace と既存 npm 環境の衝突回避

**事象**: ルートに既存の `package-lock.json` と npm 由来の `node_modules/` がある状態で、`pnpm-workspace.yaml` を追加して `pnpm install --filter v2` をルートから実行すると、pnpm がルート package.json も workspace root として処理し、既存の npm 由来 node_modules を pnpm 形式で書き換える。これは既存 v1 環境の破壊につながる。

**ハック的回避（やらないこと）**:
- ルート node_modules を退避する → v1 開発が壊れる
- `package-lock.json` を削除する → v1 の依存ロックが失われる

**根本対処**:
- v2 は `apps/v2/` 内で **`pnpm install --ignore-workspace`** を実行する
- `pnpm-lock.yaml` は `apps/v2/` 配下に生成される
- ルートには一切触れない（v1 の npm 環境は完全温存）
- `pnpm-workspace.yaml` は将来 apps を追加する時のために残しておくが、当面は実質意味を持たない

**適用基準**: monorepo の workspace 機能は「すべての sub-app が同じパッケージマネージャで運用されること」が前提。npm/pnpm/yarn が混在する状況では、各 sub-app を独立 install することを優先する。

### Lesson 2: Next.js 16 のサイレント破壊的変更

**事象**: AGENTS.md で「This is NOT the Next.js you know」と警告されていたが、実際にビルドして初めて以下の deprecation/removal を発見した:

| Next.js 15 までの書き方 | Next.js 16 での扱い | 対処 |
|---|---|---|
| `middleware.ts` + `export function middleware()` | deprecated（warn） | `proxy.ts` + `export function proxy()` |
| `next lint` コマンド | 削除（コマンド自体が "lint" を引数として解釈し失敗） | `eslint .` を直接呼ぶ |
| `next.config.js` の `eslint` オプション | 削除 | 設定不要 |
| FlatCompat + extends "next/core-web-vitals" | 循環参照エラー（ESLint v9 + eslint-config-next 16 で発生） | `eslint-config-next/core-web-vitals` を flat config として直接 import |

**根本対処**: Next.js のメジャーバージョン（特にメジャー番号 16+）を採用する場合、**最初に `node_modules/next/dist/docs/` を読んで file convention・config・CLI コマンドの最新仕様を確認する**。AGENTS.md の警告は具体的な変更点を示してくれないため、docs 直読は必須。

**適用基準**: Next.js / React のメジャーバージョン更新時、build/lint/test の各コマンドを動かして deprecation 警告を観察し、指摘されたページを `node_modules/next/dist/docs/` で必ず読む。

### Lesson 3: 依存パッケージのメジャーバージョン互換性

**事象**: 当初 `package.json` に書いた依存:
- `@sentry/nextjs: ^8.45.0` → peer dep `next@^13/14/15`、Next 16 非対応で警告
- `@google/genai: ^0.5.0` → deprecated（最新は 1.x、API も大きく変更）

これらは pnpm install 時に peer dep 警告と deprecation 警告を出してくれたから気づけた。

**根本対処**:
1. 主要 SDK は **常に最新版**を使う（特に AI/監視/決済 などの活発な領域）
2. pnpm install 後の警告（`unmet peer`, `deprecated`）を必ず読む
3. `npm view <package> versions --json` または npm レジストリで最新版を確認してから書く

**適用基準**: 依存追加時は「人間が知っているバージョン」で書かず、**`pnpm view <pkg> version` で最新を確認**してから `package.json` に記載する。バージョン記述後は必ず `install` を流して peer dep 警告ゼロを確認。

### Lesson 4: claude.md Part 2.1 設計フェーズの省略は致命的

**事象**: なし（守った）。ただし、要件定義 v3.1 だけで実装に飛び込まず、本セッション内で詳細な要件定義書（プランファイル）と Phase 1 設計フェーズ文書を作ることで、機能の抜け漏れ（Web チャット明示、オペレーターモード、Welcome Trial、PII 検出、銀行振込仮扱い、idempotency 対応の `webhook_logs`）を初期に発見できた。

**教訓**: 設計フェーズの10項目（特に異常系最低5つ）を埋める作業は、それ自体が「実装すべき機能」と「すべきでないこと」を炙り出す。一見冗長に見えても省略しない。

**適用基準**: 新規モジュール・新規 API・新規テーブル を作る際は、必ず Part 2.1 の10項目を埋めてから実装着手する。

### Lesson 5: ハック的回避の誘惑

**事象**: ESLint の循環参照エラーに遭遇したとき、`--no-eslintrc` フラグや `// eslint-disable-next-line` で逃げる選択肢があった。だが Part 1.5「エレガンスを求める」と Part 1.8「No Laziness」に従い、Next.js 16 公式 docs を読んで flat config の正しい書き方に修正した。

**教訓**: lint/typecheck/build エラーに遭遇したとき、最初に「無効化フラグ」「eslint-disable」「ts-ignore」「any キャスト」が頭に浮かぶ。これらは**ほぼ全て根本原因の隠蔽**になる。

**適用基準**: build/lint/typecheck エラーは、**根本原因を docs で確認するまでは無効化フラグを使わない**。無効化を選ぶ場合は「どの公式 issue を踏んだか」「いつまで一時的に許容するか」を tasks/lessons.md に記録する。

---

## 2026-05-09 W2 B-3 で得た学び

### Lesson 6: vitest の `clearAllMocks` vs `resetAllMocks`

**事象**: `beforeEach(() => vi.clearAllMocks())` を使ったところ、前のテストで設定した `mockReturnValueOnce` の queue が次のテストに持ち越され、5番目のテストが意図と違う mock 値を消費して fail。`clearAllMocks` は call history のみクリア、queue は残る仕様。

**根本対処**: mock の implementation/queue ごと初期化したい場合は **`vi.resetAllMocks()`** を使う。実装も含めて完全にリセットされる（vi.restoreAllMocks は元の実装を復元するため、vi.fn() 系の mock では使えない）。

**適用基準**: vitest を使う際、`beforeEach` でデフォルトは `resetAllMocks()`。`clearAllMocks` を使うのは「mock の implementation は据置きで、call history だけクリアしたい」明確な意図がある場合のみ。

### Lesson 7: middleware (proxy.ts) で DB クエリは性能 anti-pattern

**事象**: ユーザー指示で proxy.ts に `profiles.onboarded_at` チェックを追加。毎リクエストで `getUser()` + `profiles select` の 2 DB round-trip が発生する設計になった。本来 middleware は edge で動く軽量レイヤで、DB アクセスは layout / page で行う方が安全。

**やむを得ず採用した設計**: ユーザーが多層防御の第1層を proxy に置く方針を明示したため。コードに `// Phase 2 で JWT claim 化等で最適化予定` のコメントを残し、tasks/todo.md にも記録。

**適用基準**: middleware で DB アクセスを書くときは:
1. 本当に middleware でなければならないか確認（layout でも済むケースが多い）
2. やる場合は fail-open ポリシー（DB エラーで全ユーザーを締め出さない）
3. JWT claim や short-lived cookie cache での回避策を Phase 2 タスクに記録

---

## 2026-05-11 W3 設計フェーズで確立した運用ルール

### Lesson 8: admin_roles 直接 SQL 操作の安全プロトコル

**事象**: W3 では `admin_roles` の管理 UI を実装しない（W3 スコープ外、Phase 2 で対応予定）。そのため admin_roles の追加・削除は Supabase Dashboard SQL Editor 経由の直接 SQL 操作になる。**唯一の admin を誤って削除するとサービス管理不能（誰も admin API を叩けなくなり、復旧には service_role 直接介入が必要）**。

**運用ルール**:
1. **削除前に必ず admin 数をカウント**:
   ```sql
   SELECT COUNT(*) FROM admin_roles WHERE role = 'admin';
   ```
2. **count が 1 の場合、その唯一の admin を削除しない**（別 admin を先に追加してから削除）
3. **追加は冪等に**: 必ず `ON CONFLICT (user_id) DO NOTHING` を付ける
4. **削除前に対象を SELECT で確認**:
   ```sql
   SELECT ar.*, p.email FROM admin_roles ar JOIN profiles p ON p.id = ar.user_id WHERE ar.id = '<対象 id>';
   ```
5. **作業はトランザクション**: 複数操作なら `BEGIN; ... COMMIT;` で囲む

**適用基準**: admin_roles の Phase 2 UI 実装時に、上記をコード上の guard で強制する（最後の admin チェック関数を `lib/auth/admin-roles-guard.ts` に作る）。

### Lesson 9: 公開 API が service_role 経由でも RLS を“裏で”働かせる

**事象**: W3 C-7 の公開 GET API は実装の都合で service_role (admin client) を使い、コード側で `status='published'` `is_published=true` `is_active=true` を強制している。これは正しく動くが、**コードのフィルタを1か所書き忘れただけで全 draft / 非公開データが流出する**設計。

**根本対処**:
- migration 001 で各テーブルに `*_public_read` ポリシーを既に張ってある（`articles_public_read USING (status = 'published')` 等）
- C-9 で `apps/v2/supabase/tests/rls.test.sql` を整備：anon role に切り替えて draft / 非公開 / 非アクティブが返らないことを毎回確認可能
- 「コードでも DB でも」両層フィルタ。**どちらか片方が壊れても流出しない**多層防御

**適用基準**:
- 公開 API を新設するときは、対応する RLS ポリシーが既に存在するか先に確認する
- ない場合は**ポリシーを追加してから**コードを書く（コード側フィルタ忘れの保険）
- `rls.test.sql` に新エンドポイントの anon SELECT 検証ケースを追加

### Lesson 10: shadcn の Tailwind v4 移行で globals.css は手動更新

**事象**: C-1 で `pnpm dlx shadcn@latest add button card ...` を実行したが、`globals.css` の `@theme` ブロックは更新されなかった（Tailwind v3 想定の自動編集が v4 の `@theme inline` 構文と非互換）。各コンポーネントの `bg-card` `border-border` 等が CSS 変数未定義で transparent に落ち、UI が崩壊した。

**根本対処**:
- shadcn 公式テンプレ（new-york + neutral）の `globals.css` を**手動全置換**
- `:root` / `.dark` で oklch ベースの全 CSS 変数を定義
- `@theme inline` で `--color-*` `--radius-*` を CSS 変数にマップ
- `@layer base` で `* { @apply border-border outline-ring/50; }` と `body { @apply bg-background text-foreground; }`

**適用基準**:
- shadcn を Tailwind v4 で使うときは、コンポーネント追加後に `globals.css` の oklch 変数 + `@theme inline` 全セットが揃っているか目視確認
- 何か CSS が効かない症状が出たら、まず globals.css を疑う（`@theme` ブロックの不整合）

### Lesson 11: Slug 検証は DB の既存値に合わせる（コードで縛らない）

**事象**: W1 で seed した 7 カテゴリのうち `social_ins` `admin_proc` がアンダースコア表記。C-7 で公開 API の `category_slug` query param に `SlugSchema` を適用したところ、kebab-case のみ許可していた regex が `social_ins` を拒否し、フィルタ機能が壊れた。

**根本対処**:
- `SlugSchema` を `^[a-z0-9]+(?:[_-][a-z0-9]+)*$` に拡張（`-` `_` どちらも区切り文字として許可）
- DB の現実に validation を合わせる（schema の責務は「DB に格納されている値を受け入れること」）
- 統一したくなれば後で `UPDATE categories SET slug = REPLACE(slug, '_', '-')` migration（system category guard を一時解除する必要あり）

**適用基準**:
- 入力 validation regex は seed/既存 DB 値を全パターン通すか **schema 確定前に grep で確認**する
- 「コードでベストプラクティスを強制」より「現実を受け入れる」を優先（API ユーザーが詰まる方が痛い）

### Lesson 12: システムデータの保護はコードでなく DB 列に置く

**事象**: W3 動作確認中、admin が誤って seed 済みの `visa` カテゴリを削除可能だった（記事 0 件で FK 制約も発火しなかった）。AI ルーティングの根幹が消えるリスクがあった。

**選択肢比較**:
- A: DB に `is_system BOOLEAN` 列を追加し、API ガードで参照
- B: コードに `SYSTEM_CATEGORY_SLUGS = [...]` 配列を持つ
- C: 削除確認ダイアログを強化

**選択肢 A 採用、理由**:
1. **2 source of truth 回避**: seed slug は migration 001 に既存。コードに同じリストを置くと片方更新事故が必ず起きる
2. **slug rename 耐性**: rename しても `is_system=true` は残り、コード保護では rename で**サイレント無効化**する
3. **DB inspection で見える**: 別運用者が SQL Editor で見たとき、protection が data として可視

**適用基準**:
- ランタイム挙動に影響する「特殊データ」マーカー（system / featured / locked 等）は **DB 列**に置く。コード定数は最後の手段
- 例外: 完全に固定で外部標準（ISO 国コード等）は code で OK

### Lesson 14: W3 全体振り返り — W4 以降に持ち越す設計パターン

**事象**: W3 で 14 commits・113 tests 通過 + RLS 検証合格で完了。後続の W4-W8 で繰り返し再利用すべきパターンを以下に集約する。

**確立した API 設計パターン**:
- **共通レスポンスエンベロープ** (`lib/api/response.ts`): `ok(data, init?)` / `fail(code, message?)` の2関数。HTTP status は code → status マップで一元管理。**全ての route handler はこの2関数経由**で返すこと。直接 `NextResponse.json` しない。
- **入力 validation スキーマ分離**: 書き込み (`lib/admin/schemas.ts`) と公開 read (`lib/public/schemas.ts`) を別ファイル。書き込みは「DB 制約と一致」、read は「ユーザー入力を緩く受け付け」が責務。
- **Path param validation**: 動的ルートは route handler 内で必ず `UuidSchema.safeParse(id)` 等で再検証する（Zod は body しか見ない）。
- **`HttpsUrlSchema`**: `href` として render される URL は `https://` のみ許可。`javascript:` `data:` を必ず弾く。
- **`escapeLike()`**: `ILIKE` クエリの wildcards を escape。「ユーザー入力で `%` 1文字でフルスキャン」を防ぐ。
- **Postgres エラーコード翻訳**: 23505→409 CONFLICT、23503→400 INVALID_INPUT。生 `code` を返さない。

**システムデータ保護の設計判断**:
- ランタイム挙動を駆動する「特殊データ」マーカーは **DB 列**に置き、API ガードで参照（W3 では `categories.is_system`）。コード定数 (`SYSTEM_CATEGORY_SLUGS`) は使わない（2 source of truth → 必ず drift する）。
- ガードロジックは **純粋関数**として `lib/admin/<resource>-guard.ts` に切り出し、unit test で網羅する（route 内で書くと Supabase mock が必要になり負担増）。

**ペイロード設計のトレードオフ思考フレーム**:
- LIST endpoint: `body` `bio` 等の重フィールドを **省略**。サイズを `(1 row size) × (max items per page)` で見積もり、3MB を超えるなら省略。
- DETAIL endpoint: 全 locale の本文を返す。クライアントは locale 切替時に再 fetch しない（即座に切替）。
- ページネーション: 数百件規模で必須、数十件規模では省略可（`Array<T>` 直接返却）。endpoint ごとの判断を `tasks/<phase>-design.md` の §3-3 に明記。

**多層防御の構造（W3 で確立）**:
1. **proxy.ts**: 認証ホワイトリスト（PUBLIC_API_PATHS）
2. **route handler**: `requireAuth/requireEditor/requireAdmin` でロール検証
3. **Zod schema**: 入力 validation
4. **API code**: `status='published'` 等のフィルタ
5. **RLS policy**: anon/authenticated role の SELECT を DB レベルで制限
6. **`supabase/tests/rls.test.sql`**: 上記の連続検証

各層が独立。**1層が壊れても他で食い止める**前提で設計する。

**ISR revalidation**:
- `lib/cache/revalidate-content.ts` の helper を **公開ページ未存在の段階で wire up**。no-op で済む期間の負担はゼロ、retrofitting コストはゼロにできる。
- write API の最後に `revalidate{Resource}({ slug? })` を呼ぶ。helper 経由なので忘れない限り locale ループも自動で正しい。

**テスト戦略**:
- 純粋関数（schemas, guards, helpers）は **vitest で 100% カバー**を目指す。Supabase mock は最終手段（重い）。
- DB-bound な機能（RLS 等）は **SQL test スクリプト**を `supabase/tests/` に置き、Dashboard SQL Editor で実行する運用を設計書に明記。
- E2E (Playwright) は MVP では設定コスト過大、Phase 2 で「critical user-facing path がある」状態になってから。

**W4 以降で必ず再利用すべきもの**:
1. `lib/api/response.ts` の `ok` / `fail`
2. `lib/admin/schemas.ts` のパターン（Create / Update / ListQuery の3スキーマ）
3. `requireAuth` / `requireEditor` / `requireAdmin` の認可ガード
4. `lib/cache/revalidate-content.ts` の helper（W4 で chat 履歴ページを追加するなら）
5. `tests/unit/` の Zod schema 検証パターン（境界値・XSS スキーム拒否・oversized 入力拒否）

**W4 以降で新たに必要になるもの**（W3 では発生しなかった）:
- 外部 API クライアント（Gemini）の **timeout + retry + circuit breaker**
- LLM 出力の **post-processing**（disclaimer 付与、危険発言フィルタ）
- **長時間処理**のキャンセル可能性（streaming で abort 等）
- **コスト監視**（Gemini 使用量 ログ → 月次集計）

**適用基準**: 新しい route や新しい module を作るとき、本 Lesson の「確立した API 設計パターン」と「多層防御の構造」を**チェックリストとして毎回参照**する。何か逸脱する場合は理由をコード内コメント or design doc に明記。

### Lesson 15: 外部 API quota は live probe で実測する

**事象**: W4 設計書執筆時、Gemini Free tier RPD を「1500」と書いた（公式ドキュメントの旧値か、tier 移行で変更されていた）。D-4 の live probe で実測したところ **RPD は 20**（75 倍小さい）。

**もし発覚が遅れていた場合の経営インパクト**:
- ベータユーザー 20 人 × 1 日 10 チャット = 200 calls/日
- Free tier 20/日では 1 人で枯渇 → 全体停止
- ローンチ初日に致命的事故、ユーザー信頼失墜

**採用した対策**:
- D-4 段階で `tests/integration/whitelist-live.test.ts` を作成、`RUN_LIVE_GEMINI=1` で実 API を probe → 30 calls 流して RPM 5・RPD 20 を実測
- 開発時は明示的に opt-in した時のみ実 API を叩く（CI で勝手に消費しない）
- 設計書 §15 「未確定事項」に正しい数値を記録、Lesson にも転記

**ベータローンチ前夜のチェックリスト**（W7 完了後 + ベータ参加者通知前夜に必ず実施）:
- [ ] Gemini billing 有効化（Google Cloud Console）
- [ ] 課金アラート設定: 月 ¥5,000 超で通知メール
- [ ] 月次予算上限: ¥10,000（hard limit）
- [ ] API 使用量 dashboard URL を Notion に保存
- [ ] billing 有効化後に live probe を再走、429 が消えること確認

**適用基準**: 任意の外部 API（Anthropic / OpenAI / Twilio / SendGrid / Komoju 等）で free tier or rate limit がある場合、設計書の数値を信用せず**着手最初の week で必ず live probe**して実測する。実装の前に判定したいなら curl 1 発で十分。

---

**Gemini 2.5 Flash Free tier の実測クォータ (W4 D-4 で発見)**:

- **RPM: 5** （設計書で書いた 15 は誤り）
- **RPD: 20 per model** （= 1日 20 リクエストで枯渇）
- 4xx 429 のリトライは無効（retryDelay が数十秒、こちらの 500ms backoff では追いつかない）→ `lib/ai/gemini.ts` で 429 を retry 対象から除外、failsafe にエスカレ
- 開発時は Free tier で 1日 20 calls まで。それ以上必要なら billing 有効化（per-token 課金、smoke 程度なら月 100 円未満）
- production では billing 必須。クライアントが 429 を見ることは事実上ゼロになる
- Phase 2 検討: 429 レスポンスの `retryDelay` を parse して、短い (<5s) ものだけ retry する選択肢

**「primitives が安定すると統合は速い」の D-5 実証**:

D-1〜D-4 で transport / PII / KW / LLM 分類器を独立 module として整備（合計 ~3h）。D-5 の chat-pipeline 統合は **25 分**で完成。同じ機能をモノリスで書いていた場合の見積は 4-5h。**4 倍以上の差**は次の効果による:

- 各 primitive の入出力が型レベルで固定 → 統合時に「呼ぶだけ」
- primitive ごとに独立した unit test がある → 統合 test は orchestration だけに集中
- 失敗パターン（failsafe / blocked）の責務が primitive 内に閉じている → pipeline は受け取って分岐するだけ

W5 以降も「まず primitive、次に integrator」の順序を守る。整理されていない巨大関数を一気に書くと統合時のバグハンティングで時間が溶ける。

**`maskOutputPii` の `text.split + join` 制約 (D-5 L1)**:

- 現状: 同じ部分文字列を全置換、マッチ前後の境界文字は維持される（実害なし）
- 制約: 本文中に **`*****` 自体を含めたい**ケース（例: マスク済みの説明文を AI 自身が出力）で誤マスクの可能性
- 移行判断: そのケースが運用で 1 件発生したら正規表現 replace に切替
- それまで保留: 正規表現実装は対象範囲やキャプチャ群の扱いで地味にバグが入りやすい、MVP では使わない可能性高いため尚早

---

**Phase 2 / ベータ運用開始 +1週間後に思い出すべき改善ポイント**:

- **Tagalog 個別助言キーワード拡充**: 現状 `lib/ai/whitelist-keywords.ts` の TL_PATTERNS は 5 件のみ（W4 D-3 時点）。コミュニティの実フレーズに即していない可能性が高い。
  - 着手タイミング: クローズドベータ参加者 20 名から個別助言系発話 10 件以上を収集してから
  - 収集方法: `messages.whitelist_decision` JSONB を月次で抽出 → 士業 + Tagalog ネイティブで「これは個別/一般」をラベル付け → KW patterns に追加 + LLM プロンプト調整
  - 成功基準: fixture を 30 → 50 件に拡張し、偽陰性 0% を Tagalog 単独でも達成
- **PII detector の Filipino 番号 / 住所**: 同様にベータユーザーから実例が出てから regex 追加。インシデント発生 1 件で `microsoft/presidio` 等のライブラリ導入を検討 (Lesson 12 続編)
- **Whitelist 偽陰性検知**: 月次サンプリングレビュー UI を Phase 2 で構築し、運用者が「これは個別だった」とフラグ付けできる導線を作る

### Lesson 16: 設計時の deprecation チェック必須（埋め込み系モデルは特に世代交代が速い）

**事象**: W5 設計書 §4-1 で当初 Gemini `text-embedding-004` を採用と記載。user レビューで **2026-01-14 deprecated 済み**を指摘されて発覚。設計書承認 → 実装 → "なぜか動かない" の最悪コースを回避できた。

**根本原因**:
- 設計時に「公式ドキュメントで推奨されているモデル名」をそのまま採用
- 公式ドキュメント自体が deprecation schedule を更新していなかった可能性
- 「最新版を使う」(Lesson 3) は dependency バージョンには適用していたが、**API レベルのモデル名**には適用していなかった

**根本対処**:
1. 設計書承認前に **必ず最新の deprecation schedule を確認**:
   - Gemini: https://ai.google.dev/gemini-api/docs/models や `console.cloud.google.com` の API 一覧
   - Anthropic: https://docs.claude.com/en/docs/about-claude/model-deprecations
   - OpenAI: https://platform.openai.com/docs/deprecations
2. **embedding 系モデル**は特に世代交代が速い（1 年で deprecated は普通）→ "現行 stable" を明示的に確認
3. 設計書の §「未確定事項」に「使用 model 名と発表日付」を必ず書く

**適用基準**:
- 外部 API のモデル / SDK / endpoint を新規採用するとき、設計書の **承認前**に以下を確認:
  - 公式の deprecation schedule で当該モデルが listed されていないか
  - 「最後の API 更新日」と「執筆中の Claude の knowledge cutoff」のラグを意識（数ヶ月の差で deprecated もあり得る）
- W5 で `gemini-embedding-001` 採用後は、実装着手前に再度 1 call 流して 200 OK を確認（Lesson 15 と同じ「live probe」哲学）

### Lesson 18: W5 全体振り返り — RAG + チャット完成で得た知見

**事象**: W5 で 14 commits・305 unit tests + 1 Playwright E2E が通過、設計書 §18 の経営判断 8 項目を user 採決済、3 path 動作確認（answer + RAG / KW escalate / PII block）すべて実環境 OK。実時間累計 5h 35min（楽観 15.5h、悲観 21.5h、累計 **36%**）。

**確立した設計パターン（W3/W4 から継続 + W5 で新規）**:

- **embedding wrapper の設計**: `gemini-embedding-001` + MRL 768d。`taskType` を `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` で使い分け、非対称検索の精度を確保
- **RAG retrieval の責務分離**: pure 関数 (`makeSnippet`, `buildContextText`, `buildCitations`) と async wrapper (`retrieveContext`) を分離。前者で unit test、後者で integration smoke
- **failsafe の階層化**: embedding 失敗 → context なし生成（UX 維持）、generate 失敗 → escalate、SAFETY block → escalate。**各層が独立に倒れる**設計で 1 層の障害が全体停止に発展しない（master plan §9 #1, #2, #3）
- **streaming の責任分離**: `processChatStream` は generator + token callback、`/api/chat/send` は SSE 配管、`ChatShell` (client) は UI state。各層 1 責務
- **PII mask の defence-in-depth**: 入力で `detectPii` + 出力で再 `detectPii` + mask、`done.text` で UI に置換信号送出
- **single source of truth の維持**: chat disclaimers / escalation 文言は `messages/{ja,en,tl}.json` の `chat` namespace 1 箇所、server module (`disclaimers.ts`) と client (`useTranslations`) 両方からアクセス

**多層防御の実環境検証 (STOP 1 で確認済)**:

- Path 1 (一般情報): PII pass → KW pass → LLM (is_individual=false) → RAG → Gemini answer with citations
- Path 2 (個別助言): KW immediate hit (0 ms、Gemini 呼ばず) → EscalationCard + 専門家窓口
- Path 3 (PII): regex hit (0 ms、Gemini 呼ばず) → system bubble で警告 + 再入力誘導
- **Safety block path** (W4 D-7 で raw 不発、E-4 で structural 確認): LLM classifier 通過後の generate 段で `finishReason='SAFETY'` 検知 → escalate。実 API での発火は MVP 規模では稀

**コスト実測値（W5 完了時点）**:

| 項目 | 単価 | 1 chat あたり | 月 6000 chat |
|---|---|---|---|
| Gemini Flash classifier (input + output) | $0.075/1M + $0.30/1M | ~330 token | ~6 円 |
| Gemini Flash generate (input + output) | 同 | ~1200 token | ~110 円 |
| Embedding query (gemini-embedding-001) | $0.15/1M tok | ~12 token | ~1 円 |
| Embedding re-index (月 1 回) | 同 | — | ~1 円 |
| **AI 合計** | — | — | **約 ¥120-190 / 月** |
| Vercel Pro + Supabase Pro 固定費 | — | — | ¥6,800 |
| **インフラ合計** | — | — | **約 ¥7,000 / 月** |

**MAU 1 万人スケール時**: AI コスト ~3-5 万円 / 月（master plan §10 試算と整合）。

**W5 で新たに必要になったもの（W3/W4 にはなかった）**:

- 外部 API の **streaming** wrapper（retry なし、token callback）
- **SSE protocol** (server emit + client parse)
- **RPC + Database 型** の連携（match_content / increment_chat_usage を `Database<T>['Functions']` に明示）
- **Vercel cron**（30 日自動削除、E-10 で文書化）
- **Playwright E2E** harness（global-setup で Supabase admin 経由のテストユーザー作成 + storageState 注入）

**適用基準**: W5 で確立した failsafe 階層 + responsibility separation を、W6 以降の Komoju 課金 / Webhook 等でも踏襲する。特に外部 API streaming + DB write の組み合わせは「失敗を escalate に変換する変換器」を用意する。

### Lesson 19: MVP スコープ削減の判断 — W5 設計 10 components → 実装 5 components

**事象**: W5 設計書 §6-2 で UI 構成は 10 component（ChatLayout / ConversationList / MessageList / MessageBubble / MessageInput / StreamingBubble / EscalationCard / BlockedNotice / CitationLink / DisclaimerBadge）。E-7 実装時、MVP スコープを **5 component に削減** + 残りを既存 component に統合した。

**統合の中身**:

| 設計書 | 実装 | 統合先 / 理由 |
|---|---|---|
| ChatLayout | `page.tsx` 内に直接 | shadcn の primitives で十分、layout 専用 component 不要 |
| ConversationList | （削除） | 左 sidebar + 過去会話一覧は MVP 不要、「新しい相談」ボタンで state リセット |
| MessageList | `ChatShell` 内に map | 別 component にする必要なし |
| MessageInput | `ChatShell` 内に Textarea + Button | 入力欄は 1 箇所だけなので component 化しない |
| StreamingBubble | `MessageBubble` に cursor (`▍`) 含めた表示 | 同じ役割、別 component にする必要なし |
| BlockedNotice | `MessageBubble` system role に統合 | system bubble の汎用形態として吸収 |
| DisclaimerBadge | `MessageBubble` 内に inline 描画 | assistant bubble に付随する情報、独立 component 過剰 |
| **生き残り**: ChatShell / MessageBubble / CitationLink / EscalationCard / sse-client | — | core flow を担う 5 つに集中 |

**削減判断の根拠**:

1. **MVP の core flow が「送信 → ストリーミング → 応答 + 引用 + エスカレ」だけ**: 会話一覧 / アーカイブ / 編集等は Phase 2
2. **過剰抽象化のコスト**: 10 component に分けると prop drilling + tightly-coupled な component 同士の coordination が増える
3. **shadcn primitives が十分**: `Textarea` / `Button` / `Card` を直接使い、薄い wrapper 不要
4. **将来追加しやすい**: 必要になった時に component を抽出すれば良い（Phase 2 で ConversationList が要れば SWR + `/api/chat/conversations` で容易）

**実時間効果**: E-7 楽観 4h 想定 → 実 70 分（29%）。component 数削減が主因。

**注意点（適用時のリスク）**:

- 単一 component が肥大化（`ChatShell` ~200 行）。テスタビリティが下がる
- 将来「会話履歴を別 component にしたい」となった時、リファクタが必要
- → MVP は「動かす」を最優先、Phase 2 で **再抽象化のチャンスを残す**設計（pure 関数の export 等）

**適用基準**:

- 設計書の component 一覧は **「将来あり得る分割」のメモ**として扱い、MVP では **コア体験に直結する component のみ実装**
- 「 1 つの component が 300 行を超えたら分割を真剣に検討」を目安
- スコープ削減の決定は **commit message で明記**（再抽象化時に過去判断を参照できるように）

### Lesson 17: live smoke は paid 環境 or quota リセット直後に走らせる

**事象**: W4 D-7 で smoke endpoint を実装した直後に live API smoke を実行したところ、7 path 中 3 path（answer success / PII output mask / safety block）が **すべて 429 failsafe** で正常検証できなかった。原因は前日 D-4 の probe で消費した Free tier RPD 20 が未リセットだったこと。

**被害**: コードバグではないが、`smoke の合否判定が quota 状況に依存`という分かりにくい状態。「全部失敗だがコードは正しい」を毎回説明する必要がある。

**根本対処**:
- live smoke は **以下のいずれか**で行う:
  - (a) **billing 有効化済み** = 1000 RPM、quota 不安なし
  - (b) **Free tier quota リセット直後** = JST 16:00 (Pacific midnight) 直後、満タンから始める
  - (c) **smoke 用に別 GCP プロジェクト** = 独立した quota 枠
- smoke を実行する直前に `RPD 残量` を確認するか、確認用の最小 1 call で 429 を読む
- smoke 結果に「quota 切れによる failsafe」と「コード起因の失敗」を明確に区別するレポート方式を採る

**適用基準**:
- live API を呼ぶ統合テスト（vitest integration / E2E / smoke）を実行する前に、quota 残量を確認する
- 開発の終盤（commit 直前）に quota 切れで smoke が動かない、を防ぐため:
  1. 開発開始時に `RUN_LIVE_GEMINI=1 pnpm test integration/<minimal>` で 1 call、quota 残量推定
  2. 残量が smoke 必要数を下回るなら billing 有効化 or 翌朝に分割
- Phase 2 での自動化候補: `scripts/probe-quota.ts` で残量を表示する 1 行 CLI

### Lesson 21: monorepo + 部分 untracked 構成では `git add -A` / `git add .` 禁止

**事象**: 優先度2/3 の修正（apps/v2 配下 5 files）を `git add -A && git commit` で commit したところ、リポジトリルートに残っていた v1 関連の untracked ファイル群（`src/`, `pnpm-lock.yaml`, `要件定義_v3.md` 等、計 92 files）を巻き込み、97 files / 21,682 insertions の commit に膨らんだ。v3 計画書 §13 で「v1 既存コードは touch しない」と明示されている方針に反する状態。

**ハック的回避（やらないこと）**:
- そのまま放置 → 巻き込み履歴が残り、レビュー時に意図不明
- 別 commit で `git rm --cached` 一括 → 履歴がさらに混乱
- force push で書き換え → 未 push なので不要、push 済みなら破壊的

**根本対処**:
- `git reset --soft HEAD~1` で commit ポインタだけ戻す（working tree 不変、reflog に保全）
- `git reset HEAD .` で staging を全クリア
- 意図した path を **個別に列挙して `git add`**（`git add 'apps/v2/...' 'apps/v2/...'`）
- `git status --short` で staged 行が想定 5 files のみであること、untracked 行が元の v1 群に戻っていることを目視
- 再 commit + `git show HEAD --stat` で 5 files に収まったことを確認

**適用基準**:
- monorepo（特に v1 と v2 が同居していて部分的に untracked がある構成）では `git add -A` / `git add .` を**使わない**
- 変更ファイルは **明示パス指定**で add する
- 複数 file の場合も `git add path/a path/b path/c` の列挙が安全
- 「対話的に確認したい」なら `git add -p` を使う（追加分は別途 add）
- 巻き込み事故が起きたら、push 前に `reset --soft` で作り直すのが最小破壊

**補足**: AGENTS の git ガード（"Avoid `git add -A`/`git add .`"）は、まさにこの種の事故を防ぐためにある。コミットの便利さに引きずられて違反した形なので、今後は path 列挙を機械的に守る。

### Lesson 20: seed SQL の VERIFY SELECT は INSERT と同一トランザクションに置かない

**事象**: v2 seed SQL (`apps/v2/supabase/seeds/w5-seed-content-v2.sql`) を Supabase SQL Editor に貼り付けて Run したところ、末尾の VERIFY SELECT が `42803: column "c.sort_order" must appear in the GROUP BY clause` で失敗。SQL Editor は script 全体を 1 トランザクションで実行するため、INSERT もすべて rollback。`SELECT COUNT(*) FROM articles` で 6 のまま（投入前の値）と判明するまで気付けず、4 回の試行を消費（v2 では 2 回 syntax error → 3 回目で 42803 → INSERT ロスト）。

**ハック的回避（やらないこと）**:
- VERIFY を comment out で逃がす → 投入確認の手段が消える
- INSERT の手前で COMMIT を撃つ → SQL Editor は明示 BEGIN/COMMIT を許さない

**根本対処**:
- seed SQL の **VERIFY SELECT は trivial に保つ**（GROUP BY なら必要 column を全部 GROUP BY に並べる、関数依存は使わない）
- VERIFY を richer にする場合は **別エディタタブ**で INSERT 完了後に流す
- INSERT 部分は **idempotent**（`ON CONFLICT DO NOTHING` / `WHERE NOT EXISTS`）にしておけば、rollback 後の再実行が安全
- v1 SQL (`w5-seed-content.sql`) は `ORDER BY f.created_at` のみで GROUP BY 不使用 → 同じバグなし、修正不要

**適用基準**:
- 今後の全 seed SQL は **「INSERT は idempotent」+「VERIFY は GROUP BY 不使用 or 安全形」** をテンプレ化
- VERIFY 失敗時、エラー行番号は VERIFY を指すが **INSERT も巻き戻る**ことを忘れない（実行後に必ず別クエリで COUNT 確認）
- AI が GROUP BY を書くときは **SELECT 句の非集約 column を全部 GROUP BY に並べる**チェックを習慣化

### Lesson 13: ISR revalidate は早めに wire up（公開ページ未存在でも no-op で済む）

**事象**: W3 C-8 段階で公開閲覧 UI (`/[locale]/articles` 等) はまだ存在しないが、admin 側の write API に `revalidatePath()` をすべて組み込んだ。後で W4-W5 で公開ページを追加したとき、cache 無効化を retrofitting する必要がない。

**根本対処**:
- `lib/cache/revalidate-content.ts` の helper 4 つ (`revalidateArticles` / `revalidateFaqs` / `revalidateExperts` / `revalidateCategories`) を locale ループ込みで定義
- admin POST/PATCH/DELETE の成功直後に呼び出し
- 公開ページが存在しない間は no-op、存在し始めたら自動で動く

**適用基準**:
- 「ページが無いから revalidate もまだいらない」と後回しにしない
- helper 関数化しておけば 1〜2 行追加で全 admin route を網羅できる
- side effect 無視は将来の負債（n 個の admin route を周回することになる）

### Lesson 23: Gemini API の billing 切替タイミングを前倒し検討する

**事象**: 2026-05-17 段階1 動作確認中、Free tier RPD 20 を午前中の検証作業で消費しきり、classifier が `[whitelist-llm] failsafe error=transport` で全 case escalate に倒れた。プロンプト修正自体は正しかった（先頭の "こんにちは" だけは smalltalk 正しく分類）が、prompt tuning の rabbit hole に入り、原因特定に約 60 分浪費。Billing を有効化（プリペイド $10、自動リチャージ）して再スモークしたら 5/5 期待通り通過。

**ハック的回避（やらないこと）**:
- Lesson 17 で書いた「smoke は paid 環境 or quota リセット直後」のガード判断を、当日朝の作業計画段階で忘れて Free tier のまま開発を続けた
- 429 を見たときに「プロンプトが効いてない」「hot reload が壊れてる」と先に疑ってプロンプトを4回修正・3回コミット
- 後付けで「明日 billing 切替予定だった」と言い訳

**根本対処**:
- billing 切替を「予定の前日」ではなく「**Free tier 消費の兆候が出た瞬間**」に前倒し
- 開発の濃い日（MVP 終盤・デモ前・大型機能の動作確認日）は朝イチで billing 状態を確認、必要なら30分以内に切替
- 切替フローは: AI Studio で「クレジット購入 → 自動リチャージ」が正式（Google Cloud Console で請求先紐付けは前提だが、それだけでは使えない、**クレジット入金が別途必要**）
- 月¥3,000 予算アラート（50/90/100% メール）と自動リチャージの**二重防御**で運用

**適用基準**:
- 朝の TODO に「Gemini billing 状態確認」を入れる（特にデモ前2週間、MVP 機能の動作確認日）
- live smoke を実行する前に「Free tier 残量」を確認、5回以上呼ぶ予定なら billing 必須
- 429 を見たら **プロンプト修正の前に classifier failsafe ログを確認**: `[whitelist-llm] failsafe error=transport` が出ていたら quota 切れ確定、prompt は触らない
- 診断ログ（`[whitelist-llm] classify start / raw / parsed` + `[chat] keyword pass`）は、こういう「コード起因 vs インフラ起因」の切り分けを 30 秒で行うために存在する — 引き続き残す

**補足**: Lesson 17 + Lesson 23 は同じ根を持つ（quota が見えない盲点）。Lesson 17 が「smoke 実行時の予防」、Lesson 23 が「開発進行中の前倒し判断」。両方ともセッション開始時のチェックリストに組み込み済みであるべき。

---

### Lesson 24: migration 全文 SQL 適用時の rollback 巻き込みで一部 DDL が抜ける

**事象**: 2026-05-09 頃に migration 004（`apps/v2/supabase/migrations/004_w5_chat_columns.sql`）を Supabase SQL Editor に貼り付けて Run した際、末尾の `CREATE OR REPLACE FUNCTION match_content` までは流れたものの、**先頭の 2 つの `ALTER TABLE`（messages.citations / profiles.chat_retention_permanent）が production DB に未適用**のまま 8 日間放置されていた。2026-05-17 に文脈継承機能 (A) の動作確認中、`persistAssistantMessage` が `Could not find the 'citations' column of 'messages' in the schema cache` で全 assistant message の永続化に失敗していることで発覚（Lesson 25 と直結）。

**ハック的回避（やらないこと）**:
- 「schema cache の失効」と思い込んで `NOTIFY pgrst, 'reload schema';` だけ叩く → 実カラムが無いので何度叩いても解決しない
- 既存 120 行への影響を恐れて適用を見送る → `ADD COLUMN IF NOT EXISTS ... DEFAULT '[]'::jsonb` は idempotent + 既存行に DEFAULT 遡及で非破壊

**根本対処**:
- migration を SQL Editor に流したら、**各 DDL の `information_schema.columns` SELECT で目視 verify** をテンプレ化
- IF NOT EXISTS を必ず付ける（再実行で補完できる安全網）
- 適用後に `\d table_name` 相当（`SELECT column_name FROM information_schema.columns WHERE table_name=...`）を別クエリで実行
- migration tracker（`supabase_migrations.schema_migrations` 等）が使われていないプロジェクトでは特に厳格に

**適用基準**:
- Supabase SQL Editor で複数 DDL を含む migration を流したら、最後にカラム一覧の verify SELECT を必ず実行
- 「migration ファイルがある = 適用済」と仮定しない。実 DB の `list_tables` / `information_schema` で確認するのが唯一の真実
- 根本対策は **Supabase CLI 運用への移行**（`supabase db push` + `supabase migration up` + CI で未適用検知）— Phase 2 backlog
- Lesson 20（VERIFY SELECT を INSERT と同一トランザクションに置かない）と同じ族の教訓：**「実行した」と「成立した」は別**

---

### Lesson 25: chat-pipeline の persistence 失敗 catch でサイレント壊れが 8日間放置された

**事象**: Lesson 24 で書いた通り `messages.citations` 列が production DB に存在しないまま 8 日間運用された。`persistAssistantMessage` は毎回 PGRST204 で失敗していたが、`/api/chat/send` の route handler が `try/catch` で persistence エラーを catch して `console.error` だけ吐いて SSE 応答を返し続けていた（[apps/v2/src/app/api/chat/send/route.ts:114-118](apps/v2/src/app/api/chat/send/route.ts#L114-L118)）。結果として:
- UI 側はチャット動作中に見える（応答ストリームは正常）
- DB には user 行のみ書かれ assistant 行は欠落
- 「履歴 0 件の会話」がずっと作られ続けていた
- dev 起動時にしか発覚せず、 production では Sentry も未導入のため誰も気付かない

**ハック的回避（やらないこと）**:
- persist 失敗時に SSE も close する → UX 体感が崩れる、根本対策にならない
- catch を外して例外を上に投げる → SSE 接続の controller closed 問題で stream error が新たに発生

**根本対処**:
- **Sentry 導入と persistence エラーの error 送信**: `console.error` だけでは production で誰も気付かない。Vercel checklist Section 3 で導入予定
- **起動時 schema assertion**: アプリ起動時に必須カラム（`messages.citations`, `messages.whitelist_decision` 等）の存在を `information_schema` で確認、欠けていたら起動失敗 or 警告。Phase 2 で `apps/v2/src/lib/supabase/health-check.ts` 新規追加
- **暫定対策**: dev 環境では起動時に `[health] schema OK` 形式のログを出す。`messages.citations` 等の必須列を SELECT 1 回打つだけで良い

**適用基準**:
- 「catch して continue で degrade」設計は **観測手段とセット**でないと silent fail を生む
- 新規 try/catch を書くとき：catch 句で握り潰してログだけ出すなら、必ず error monitoring（Sentry / Logflare 等）に送る or alert 経路を定義する
- 「UI が動いてる」を「正常動作」と判定しない。今回のように DB だけ壊れているケースは UI からは見えない
- Phase 2 で **monthly audit query**（assistant 行が user 行に対してどの程度欠けているか）を admin dashboard に追加

---

### Lesson 26: `.env.local` を確認なしに `cp` で上書きして実キーを破壊した

**事象**: 2026-05-28、sidebar 会話管理機能のブラウザ確認のため dev サーバを立てようとして、`cp .env.local apps/v2/.env.local` を「念のため env を用意」の名目で実行。だが `apps/v2/.env.local` は 2026-05-10 から存在する実ファイルで、production プロジェクト（`vawreuciwcdittxgdilc`）の Supabase キー + `GEMINI_API_KEY` を保持していた。root の `.env.local` は v1 残骸（別 Supabase プロジェクト `ljzuiksgloklmbotqkro`、GEMINI キー無し）だったため、上書きで実キーを破壊。gitignore 対象 + バックアップ/swap 無しのため復元不能。production（Vercel の env ストア）は無傷。

**ハック的回避（やらないこと）**:
- 上書きした v1 env をそのまま使い「動くように見せる」 → 別プロジェクト + GEMINI 欠落で chat が壊れる、ごまかしにならない
- root の値で適当に再構成 → GEMINI_API_KEY は root に存在しないので不可能、Supabase も別プロジェクトで誤り

**根本対処**:
- 破壊を即座にユーザに報告（隠さない）。Vercel env から復元（`npx vercel link` → `npx vercel env pull apps/v2/.env.local`）が最短ルート
- 以後 `.env*` への書き込みは **必ず事前に存在確認**（`ls` / `cp -n` / `test -e`）。上書きフラグ無しの `cp` を秘密情報ファイルに使わない

**適用基準**:
- `.env`, `.env.local`, 認証情報ファイル, lock ファイル等「再生成不能 or gitignore 対象」への書き込み前に必ず存在チェック。存在したら上書きせず別名 or 中止してユーザ確認
- 「念のため用意」系の操作ほど確認を省略しがち。秘密情報・設定ファイルは reversible でないと心得る（Lesson 21 の "git add -A 禁止" と同族：破壊的操作の前に対象を確認）

---

### Lesson 27: migration ファイルが repo にあること ≠ 本番に適用済み（007 ドリフト）

**事象**: 2026-06-25、Phase 2 着手の精査で `007_anon_hardening.sql` が repo に存在するのに本番 `pg_policies` には `is_anonymous` 述語が無いことを実測で発見。匿名ユーザが profiles の age_verified 改ざん・inquiries/consent_logs 汚染が可能な状態が live で残っていた。原因は migration の手動 SQL Editor 適用運用で `schema_migrations` tracker が空（Lesson 24 と同根）。handoff §6 の「REVOKE 未実行」も、本番ライブは EXECUTE=false で実は塞がっていたが REVOKE 文が履歴に無い、という二重のズレだった。

**ハック的回避（やらないこと）**:
- repo にファイルがある＝適用済みと仮定して次の機能に進む → live の穴を見逃す
- handoff の記述だけ信じて本番の実状態を確認しない → 「塞がっている/いない」を取り違える

**根本対処**:
- DDL を含む作業の前に、必ず本番の実状態を読み取り専用で照会して突合する（`pg_policies` / `has_function_privilege` / `proconfig`）。repo・handoff・設計書はいずれも陳腐化しうる前提で実機を真実とする。
- 008 で 007 を冪等に再適用し、REVOKE/search_path を履歴化。適用後は同じ照会で4項目を独立 verify（Supabase advisor の警告消失も確認）。
- 構造的再発防止は P0-B（Supabase CLI 移行 + `schema_migrations` baseline + 未適用検知 CI gate）。

**適用基準**:
- 「migration ファイルがある」「handoff にこう書いてある」を適用済み・対処済みの証拠として扱わない。本番 catalog の実測のみを根拠にする。
- Phase 2 以降の各 migration 適用後は advisor security を必ず再取得し、想定外の警告増減が無いか確認する。

---

## テンプレート: 新しい教訓を追加するときの形式

```markdown
### Lesson N: <一言で表現>

**事象**: 何が起きたか、客観的事実

**ハック的回避（やらないこと）**: 誘惑にかられたが採用しなかった選択肢

**根本対処**: 採用した解決策

**適用基準**: 将来の類似ケースで何をトリガーに本記録を参照するか
```

---

## セッション開始時のチェックリスト

新セッション開始時、以下を順に行う:
1. `~/.claude/CLAUDE.md` 全体を読む
2. プロジェクト直下の `CLAUDE.md` / `AGENTS.md` を読む
3. **本ファイル（tasks/lessons.md）を読む** ← 過去の失敗パターンを確認
4. `tasks/todo.md` を読む（進行状況把握）
5. プランファイル（`~/.claude/plans/...`）を読む（要件定義の決定版）
