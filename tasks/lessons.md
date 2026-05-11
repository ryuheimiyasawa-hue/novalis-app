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
