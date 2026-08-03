# Novalis App 開発 — 新セッション引継ぎ

_最終更新: 2026-08-03 / セキュリティ修正を本番反映し、P2-B2 operator 介入を実装した直後_

新しい Claude チャットを開始したら、まず本ファイルを読んでから作業に入ること。
Phase 2 の実行計画と各項目の状態は `docs/phase2-masterplan.md` が正本。

---

## 00. 現在地（2026-08-03 後半セッション終了時点）

### 直近セッションで動いたこと

- **PR #18 マージ済み（本番反映済み）**。Next.js 16.2.11。マージ後に本番で proxy の認可を実測確認した: 未認証の `/admin`・`/admin/conversations`・`/ja/chat`・`/ja/dashboard` はすべて `/ja/login?redirect=...` へ 307、`/ja` と `/ja/contact` は 200、`x-middleware-subrequest` 系のバイパスヘッダを付けても素通りしない、API は 401。**認可バイパスは塞がった**。
- **PR #19 マージ済み（本番反映済み、`9199f81`）**。P2-B2 operator 介入。設計書は `docs/phase2-b2-operator-design.md`（design-gate 10項目・承認済み）。デプロイ後に本番で確認: 公開ページ 200、`/admin/conversations` と `/ja/chat` はログインへ 307、新規 API 4 本（updates / takeover / release / messages）はいずれも未認証で 401。
- **migration 010 適用済み**（Supabase MCP、`schema_migrations` に記録あり）。`operator_takeover` / `operator_release` の 2 関数。
- **P2-B2 の UI 実動作確認は完了**。本番で takeover → 運営返信 → release まで通し、`operator_takeover_logs` に takeover と release が同一担当者で 1 件ずつ残ることを確認済み。未確認は 2 点のみ（運営対応中に利用者が発言したときの案内表示、release 後に AI が再開すること）。
- **PR #21 `phase2/p0b-migration-drift`（レビュー待ち）**。P0-B 未適用検知。migration 011 は本番適用済み。001〜007 は本番カタログで実在を 13 項目検証したうえで `schema_migrations` に baseline 登録済み（現在 001-011 の 11 件が揃っている）。010 の履歴名も `010_operator_takeover_rpc` に揃えた。

### マイグレーション運用（P0-B 以降のルール）

マイグレーションを足すときは 3 つセットで行う。ファイルを `apps/v2/supabase/migrations/` に置く、`src/lib/supabase/migration-manifest.ts` の `EXPECTED_MIGRATIONS` に basename を足す、本番に適用する。マニフェストを忘れると CI が落ち、適用を忘れると admin の全ページに赤いバナーが出る。手元では `pnpm check:migrations` で確認できる（DB env が空でもマニフェスト側だけは検証される）。

**この仕組みが守れないもの**: 「マイグレーションが走った」ことは保証するが「DDL が存在する」ことは保証しない。Lesson 24 のような部分適用は履歴行だけ残って検知をすり抜ける。いま守っているのは MCP `apply_migration` がトランザクショナルであることなので、**SQL Editor で手作業適用をするなら従来どおり `information_schema` / `pg_catalog` で個別 verify が必須**。
- 残り high 3 件（brace-expansion ×2 / sharp）は上流にパッチが無く据置き。CI の audit 赤はこれ。

### P2-B2 で決めたこと（次に触るとき前提になる）

- 配信は**ポーリング**（通常 30 秒 / 運営対応中 5 秒 / タブ非表示で停止 / 失敗は指数バックオフ後に諦めてバナー）。Realtime は 200 名規模で再検討。
- **operator ロールは新設せず admin のみ**。`requireOperatorRole()` は `requireAdmin()` の別名のまま（理由はコード内コメント）。
- **自動 release は作らない**。返信中に AI が再開する事故のほうが放置より悪い。admin 一覧の「対応中 N 件・最長 X 経過」バナーと admin の強制解除で運用する。
- **Messenger チャネルは takeover 不可**（返信を FB へ返す経路が審査待ち）。UI 側で無効化済み。

### さらに前のセッションで本番反映まで完了したもの

- **P2-J 飲食店管理画面**（PR #10）。`/admin/restaurants` で運営が実店舗を CRUD 可能。データは現在ダミー。
- **P2-M 問い合わせ first-party 化**（PR #11）。`/contact` を外部 Google フォームから自前フォームへ置換し、`inquiries` テーブル＋ `/admin/inquiries` 受信箱で対応状況を管理。
- **管理トップの導線整備**（PR #13）。`/admin` のカードに飲食店・問い合わせ・メトリクスを追加。
- **P2-B1 会話ビューア**（PR #15）。`/admin/conversations` で個別会話の全文・エスカレ証跡を閲覧（**閲覧専用**、requireAdmin）。
- **P2-K Messenger 自己連携**（PR #16 ＋ migration 009）。`messenger_link_codes` を追加し、利用者が `/[locale]/messenger` で 6 桁コードを発行 → ボットに送信 → `messenger_links` が自動生成される。**これが無いとテスター展開が不可能だった**（従来 `messenger_links` は読むだけで書き込む処理が存在しなかった）。
- **ログアウト機能**（PR #17）。従来アプリにログアウトが無く、匿名セッションに入ると自力で抜けられなかった。

### 未マージ / 保留中の PR

- **PR #19 `phase2/p2b2-operator-takeover`** — P2-B2 operator 介入。CI 緑・migration 適用済み。マージ後は本番で「takeover → 別ブラウザの利用者側に運営返信が 5 秒以内に出る → release で AI 応答が戻る」を目視確認すること（ローカルに本番 env が無く認証付き E2E が組めないため、ここだけ手動）。
- **PR #12 `phase2/p2m-inquiry-slack-notify`** — 新規問い合わせの Slack 通知。コードは完成・CI 緑。ユーザーが Slack Webhook URL を用意する気になった時点でマージ＋ `SLACK_INQUIRY_WEBHOOK_URL` を Vercel に設定すれば有効化される。未設定なら no-op なので放置しても無害。

### ユーザー側の宿題（着手順）

1. ~~**Sentry DSN 設定**（未了・優先）~~ → **記述が古い。2026-08-03 に実測で訂正**。本番のクライアントバンドル（`/_next/static/` の全 chunk を走査）に `o<org>.ingest.us.sentry.io/4511360248709120` 形式の DSN が埋め込まれており、`NEXT_PUBLIC_SENTRY_DSN` は **Vercel 本番に設定済み**。サーバー側の `SENTRY_DSN` はバンドルに出ないため外部からは確認できないが、通常セットで設定するものなので入っている可能性が高い。Vercel の env 画面で 1 度だけ目視確認すれば確定する（server 側が未設定なら、route handler からの `Sentry.captureException`＝operator 系アラートと persist 失敗アラートが no-op のままになる）。
2. **アプリアイコン選定**。`docs/brand/` に 3 案（A: 青地＋吹き出し＋太陽 / B: 国旗＋吹き出し＋太陽 / C: 太陽マーク）。B を推奨済み。選定後 Facebook アプリ設定へ。
3. **Messenger テスター登録**（アプリの役割 → テスター）。審査なしで実ユーザーに使わせる道。
4. **飲食店・専門家の実データ投入**。専門家データは P2-N（マッチング）の前提。
5. **弁護士監修の回答待ち**。軽量版パッケージ（`~/Desktop/Novalis弁護士監修依頼_軽量版.docx`、質問 8 問）送付済み。回答でエスカレ文言・PII 方針・4 本柱の可否が確定する。

### 次に着手予定（内製・外部依存なし）

1. **PR #19 のマージと本番目視確認**（上記）。
2. **P2-N 専門家 embedding マッチング**。実データ投入と同期して着手。
3. 多言語 RAG の有効化（en/tl の記事本文投入が前提）。
4. operator 介入の残タスク（優先度低）: 対応すべき会話の通知（エスカレ発生時に Slack へ、PR #12 の仕組みを流用）、`updates` エンドポイントのレート制限。

### 踏むと事故る地雷

- **CI の `dependency audit (high+)` の赤は report-only**。branch protection の必須チェックは `lint / typecheck / test / build` のみ。赤でもマージ可。
- **`brace-expansion` を pnpm overrides で潰そうとするな**。パッチ版が 5.x のみで ESM/named-export 化しており、eslint と @sentry bundler plugin を壊す（`TypeError: expand is not a function`）。PR #14 で試して撤回済み。上流待ち。
- **`sharp` も同様に触るな**。next が `optionalDependencies: sharp ^0.34.5` を宣言しており、0.35 強制は規約違反。
- **セッション Cookie は httpOnly**（`lib/supabase/server.ts`）。ブラウザ側 `supabase.auth.signOut()` では消せない。ログアウト等は必ずサーバー側（Route Handler）で行う。
- **匿名セッションの罠**。「ログインせずに試す」で入ると匿名ユーザーになり、Messenger 連携・問い合わせ送信が仕様上ブロックされる（007/008 の意図的なハードニング）。PR #17 のログアウトで脱出可能になった。
- **ローカルに本番の機密 env が無い**ため、認証付き E2E はローカル実行不可。検証は単体テスト＋Supabase MCP の実機 SQL＋Vercel プレビューで行う。
- **AI パイプラインをバイパスする分岐を足すときは、入口の PII / 長さガードまで一緒に外していないか数える**（Lesson 30）。`processChatStream` を呼ばない経路は `screenUserInput()` を明示的に通すこと。
- **`conversations.mode='operator'` の会話は AI が答えない**。「本番でチャットが無反応」の調査では、まず `SELECT mode, operator_user_id FROM conversations WHERE id = ...` を見る。自動 release は意図的に存在しないので、放置された takeover は admin 一覧のバナーからしか気付けない。

---

## 0. Phase 2 進捗スナップショット（2026-06-30）

ここから下の §1〜§8 は 2026-05 デモ期の記録（依然有効な基本情報）。本セクションが最新の到達点。

### 開発ワークフロー（重要・5月から変更あり）

- **main はブランチ保護下**。直 push 不可。変更は feature ブランチ → PR → CI（`quality` チェック必須）→ merge。merge で Vercel 本番自動デプロイ。
- CI: `.github/workflows/ci.yml`（lint / typecheck / test / build をブロッキング、`pnpm audit --prod --audit-level high` もブロッキング）。
- マイグレーションは Supabase MCP の `apply_migration` で適用＝履歴テーブルに記録される（手動 SQL Editor 運用は卒業）。`list_migrations` で確認可。
- 検証体制: ユニットテスト（DBモック、現在 409 件）＋ RLS は MCP `execute_sql` でロールバック安全に実機検証（`supabase/tests/rls.test.sql` 相当）＋ Vercel プレビュー。**有料テスト DB は不採用**（Pro プランで +$10/月、費用対効果が低い）。ライブ DB の Playwright E2E は保留。

### 本番反映済み（このフェーズで完了、すべて merge 済み PR）

- **P0-A** セキュリティ恒久化（`008_security_hardening.sql`）: 未適用だった 007 anon-hardening を再適用（匿名ユーザの profiles 改ざん・inquiries/consent_logs 汚染を封鎖）、SECURITY DEFINER 3 関数の EXECUTE を PUBLIC/anon/authenticated から REVOKE（service_role 維持）、4 関数に `SET search_path=''`。advisor の該当 WARN 解消。
- **P0-C** 認証ハードニング: 最小パスワード長 6→8、漏洩パスワード保護 ON（Dashboard）、匿名ユーザ purge CLI（`pnpm purge:anon`、保持 `ANON_RETENTION_HOURS` 既定 72h、dry-run 既定）。
- **P1-D** PII 安全 Sentry ＋ persist 失敗アラート: `lib/sentry/scrub.ts` の beforeSend で全イベントの PII をマスク、chat/send の persist 失敗を `Sentry.captureException`＋構造化ログ化（Lesson 25 対策）、`app/global-error.tsx`。**SENTRY_DSN 未設定なら no-op**（本番 env に DSN 設定で起動 = ユーザ作業待ち）。
- **P1-E** Next.js 16.2.2→16.2.9（proxy bypass 等 high 解消）＋ `@google/genai` 配下の間接 high を pnpm overrides で解消（ws/protobufjs/hono）＋ CI audit をブロッキング化。
- **P1-F** エスカレ判断の監査証跡: `messages.whitelist_decision` を実保存（`lib/ai/whitelist-decision.ts`、route で配線）。escalationScore は決定論的暫定値。escalation 用 env を scaffold（既定 OFF）。
- **P1-G** CI 品質ゲート ＋ ブランチ保護。
- **P1-I** admin の記事/FAQ mutation で自動 reindex（silent staleness 解消）＋ 多言語 RAG（en/tl の本文がある時に各ロケールで embed。現状コンテンツは ja のみなので翻訳投入で有効化）。
- **P2-L 改善2** エスカレ「それでも質問を続ける」ボタン＋再表示 cooldown。`NEXT_PUBLIC_ESCALATION_SHOW_CONTINUE_BUTTON` 既定 OFF（弁護士回答＋対話 UX 検証まで OFF 維持）。

### 保留・繰り延べ（理由付き）

- **P0-B** Supabase CLI 全面移行: MCP で履歴記録が機能しているため優先度低下。001-007 の baseline 登録と連番/タイムスタンプ命名の整合は CI 拡張時に対応。
- **P1-H** ライブ DB の E2E/統合の CI 化: 無料で組むには CI 内 Supabase スタックが必要で重く、費用対効果が低いため保留。RLS は MCP 実機検証で代替。
- **P1-D の UX 系**（ローカライズ `[locale]/error|loading|not-found`、構造化ログ全面移行）、**Gemini コスト監視**（Sentry DSN 設定後に組）。
- escalation graded score の LLM 出力化（P2-L 改善1 の前提、ライブ Gemini 検証要）。

### ユーザ作業待ち（任意・少量）

- **Sentry DSN**: sentry.io で Next.js プロジェクト作成 → Vercel 本番 env に `SENTRY_DSN` ＋ `NEXT_PUBLIC_SENTRY_DSN` 設定で P1-D 起動。
- **監査証跡の即時確認**: ログイン状態の本番でチャット 1 通送れば `whitelist_decision` 書き込みを MCP で確認可能（デプロイ後まだ新規チャットが無く 0 件）。

### 次セッションの着手候補（M2、多くが外部依存）

飲食店カタログ（掲載店データ待ち）/ 専門家 embedding マッチング（協業企業データ待ち）/ エスカレ改善1・4（弁護士回答待ち）/ Messenger（FB 公開モード移行待ち）/ operator 介入 UI（自律可、UI 検証は手動）/ 問い合わせ first-party 化。

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

## 5. Phase / W スコープ整理

W ナンバリングは Phase 1 内のスプリント単位として元計画に存在したもの。MVP A-E 拡張で Phase 1 が前倒し完了したため、W6+ は元計画通りには進まず一部 Phase 2 に統合された。**コード内 `W6` / `W7` コメントは下記元定義を指す**ので次セッションで参照する場合は注意。

### 完了済（Phase 1）

- **W2**: 認証 (Facebook OAuth via Supabase Auth) + onboarding + consent log
- **W3**: admin CMS (articles / faqs / experts / categories) + ISR + `revalidate-content` ヘルパ
- **W4**: chat-pipeline 基盤 — PII detection + Stage1 keyword + Stage2 LLM classifier + smoke endpoint
- **W5**: RAG (pgvector + match_content RPC) + 本番チャット SSE + persistence + quota
- **段階1**: 会話設計 polish（commits `baba4f8` / `42dea3e` / `1587e51`）
- **MVP A-E + Sidebar**: 文脈継承 / 過去会話 UI / 記事一覧 / 動画埋め込み / 問い合わせ
- **デプロイ**: Vercel + Supabase production 2026-05-17

### 元 W 計画の W6+ 定義（コード内コメントの参照元）

`apps/v2/tasks/W5-design.md` §1-2 "含まないもの (W6 以降)" と env validator コメント由来:

- **元 W6** — Komoju 課金（プラン購入導線、checkout、webhook）。`NEXT_PUBLIC_PAYMENT_ENABLED` flag 化済
- **元 W6** — オペレーター介入 UI（chat-pipeline.ts:43 のコメント参照、`conversations.mode='operator'` + `operator_takeover_logs` テーブル既存）。**v3 で Phase 2 送りに変更**
- **元 W7** — Facebook Messenger Bot 連携（env validator の `MESSENGER_*` 三点リザーブ済）。**v3 で Phase 2 送りに変更**
- **元 W8** — 飲食店カタログ（`restaurants` テーブル既存 / 行 0）。**v3 で Phase 2 送りに変更**
- **元 W9-W10** — ベータテスター期間（`whitelist-keywords.ts` の Tagalog パターン拡張コメント参照）

つまりコード上の "W6 operator UI lands later" / "for Bot from W7" 等の表記は元計画基準。実際には Phase 2 backlog に統合済。

### v3 要件定義 §6 Phase 2 (Phase 1 から 3〜6ヶ月後)

- 社労士・税理士の本格運用、機能2の個別対応強化
- コミュニティ機能（Facebook Group 連携 or 限定的な掲示板）
- 不動産紹介（広告掲載型）
- 通訳予約・書類翻訳

### 本セッション累積で追加された Phase 2 候補

- **メッセンジャー対応**（旧 W7）
- **Komoju 課金**（旧 W6）— 月額 / 3ヶ月 / 6ヶ月 / 12ヶ月プラン
- **オペレーター介入 UI**（旧 W6）— `operator_takeover_logs` 既存テーブル活用
- **飲食店カタログ**（旧 W8）
- **会話タイトル AI 自動生成** — 初回発話を Gemini で 20 字要約して `conversations.title` に保存
- **長会話の要約** — A は直近 10 turns 固定、トークン上限近で古い turn を要約圧縮
- **Sentry 本格稼働** — env 設定 + persist 失敗の error 送信 + PII filter in beforeSend + 起動時 schema assertion（Lesson 25 根本対策）
- **Supabase CLI migration 運用** — `supabase db push` + CI で未適用検知 gate（Lesson 24 根本対策）
- **会話の削除・編集・検索** — sidebar 拡張
- **動画埋め込み拡張** — 案2 (markdown 内カスタム構文) or 案3 (iframe sanitize) への移行
- **問い合わせ first-party 化** — Google Form → inquiries テーブル + admin dashboard
- **月次サンプリングレビュー UI** — `messages.whitelist_decision` JSONB 保存済、レビュー UI 未実装
- **AI 出力の audit batch** — 月次で whitelist 判定の precision/recall 計測
- **function_search_path_mutable × 4 関数** — `SET search_path = ''` 追加（Phase 2 polish）

### 並行で進む人間タスク

- 弁護士監修依頼（利用規約・プラポリ・AI 応答の非弁境界）
- 協業企業5社打診（士業ネットワーク構築、experts テーブルに実 row 追加）
- マニュアル native review（フィリピン人ベータ参加者に `docs/manual-tl.md` レビュー依頼）
- Facebook App 公開モード移行（本番ユーザ獲得前）
- ベータ参加者からのフィードバック収集

### 推奨着手順（次セッションで再確認）

1. **REVOKE SQL 実行**（Phase 2 着手前の security fix、§6 参照）
2. Phase 2 から **1〜2件選定** → feature ブランチで着手。候補:
   - **候補A**: Komoju 課金（旧 W6）— 大規模、課金フロー全体設計が要、`NEXT_PUBLIC_PAYMENT_ENABLED` フラグ flip と一緒
   - **候補B**: Messenger 対応（旧 W7）— Facebook 公開モード移行とセット、`MESSENGER_*` env 既リザーブ
   - **候補C**: 会話タイトル AI 自動生成 — 小規模（1 日）、ユーザ体感即効性高
   - **候補D**: Sentry 本格稼働 + persist 失敗 alert — 運用品質向上、本番稼働直後にやる価値高い
   - **候補E**: オペレーター介入 UI（旧 W6 の半分）— `operator_takeover_logs` 既存活用、管理画面拡張
3. C と D は小タスク、A/B/E の大型機能の合間に組み込み可能

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
