# Novalis Phase 2 マスタープラン(完全版)

_作成: 2026-06-25 / 7サブシステムのコード+本番DB精査(マルチエージェント)を統合した実行計画_
_前提: M0 セキュリティ恒久化を最優先で先行(ユーザ承認済 2026-06-25)_

本ドキュメントは「Phase 2 を最後まで作り切る」ための実行計画。着手から完了までを M0-M3 の4マイルストーンに分け、各項目の設計要点・依存・成果物・完了基準・工数を定義する。

スコープ制約(ユーザ指示):
- Komoju 課金はスコープ外。将来フック(`profiles.komoju_*` / `webhook_logs(source='komoju')` / `NEXT_PUBLIC_PAYMENT_ENABLED`)のみ温存。
- Messenger 連携は Phase 2 必須に含める。
- Phase 1 積み残しの飲食店カタログ(機能7)も作り切り対象。

---

## 0. ゴールと完成の定義

Phase 2 完了とは、内製で作り切れる範囲(M0-M2)が本番稼働し、外部依存項目(M3)が依存解消トリガで着手可能な状態に整理されていること。具体的には次を満たす。

- 本番のセキュリティ穴(匿名なりすまし・DoS 再現性・サイレント壊れ・Next 脆弱性)が解消され、マイグレーション履歴から再現可能。
- main マージ前に品質ゲート(lint/typecheck/test/build/audit)が強制され、Sentry が本番でエラーとコスト異常を捕捉。
- 飲食店カタログ・エスカレ改善・operator 介入・Messenger が稼働(Messenger 本番送信のみ FB 審査待ち)。
- 専門家マッチングと要件 v3 の4本柱は、外部依存(協業データ・弁護士回答・経営判断)が解け次第に着手できる設計まで確定。

---

## 1. 精査で確定した現状

本番DB(pg_policies / Supabase advisor / has_function_privilege)と実コードを突合した実測結果。

### 1.1 機能より先に塞ぐべき本番の穴(4件)

1. **007_anon_hardening が本番未適用(高・実害あり)。** `007_anon_hardening.sql` はリポジトリに存在するが、本番 `pg_policies` に `is_anonymous` 述語が無い。匿名サインインのユーザが自分の `profiles` を UPDATE して `age_verified` を false へ戻す/`prefecture_code` を改ざん、`inquiries`・`consent_logs` に直接 INSERT してサポート受信箱と同意ログ(法的証跡)を汚染できる。年齢確認改ざんは18歳未満排除運用の根幹を崩す。

2. **REVOKE / search_path が migration 化されていない(高・再現性)。** `increment_chat_usage` / `match_content` / `handle_new_user` は本番では anon/authenticated の EXECUTE=false で塞がっている(handoff §6 の DoS は本番ライブでは解消済)。だが REVOKE 文がどの migration にも無く、proconfig=null で search_path 未固定。新環境を migration から作ると PUBLIC EXECUTE 既定で DoS が再オープンし、SECURITY DEFINER 関数の search_path 未固定は権限昇格の温床。

3. **persist 失敗が console.error のみ、Sentry 本番未稼働(高)。** `route.ts:116-122` の保存失敗 catch はログ出力だけ。Lesson 25 の8日間サイレント壊れはこの経路。

4. **Next.js 16.2.2 に未パッチ high 脆弱性(高)。** Middleware/Proxy bypass・WebSocket SSRF・DoS が 16.2.3-16.2.6 で patch 済。proxy.ts の認可境界に直撃。

### 1.2 構造的課題

- migration が全て SQL Editor 手動適用(CLI 非管理、`list_migrations` 空)。1.1-1 のドリフトと Lesson 24 の根本原因。
- CI/CD 不在(`.github` 無し)。main 直 push が品質ゲート無しに即本番 Vercel デプロイ。
- pnpm audit 未 CI 化で high 含む脆弱性が放置。

### 1.3 運用・多言語の実害(機能として未完)

- `whitelist_decision` が本番で常に null 保存(`route.ts:108` で未配線)。エスカレ判断の監査証跡がDBに皆無で、弁護士法リスクの説明責任を後追いできない。
- 記事/FAQ 公開時に embedding 自動再生成が未配線(reindex は CLI 手動のみ)。公開しても RAG に反映されない silent staleness。
- reindex が `language='ja'` 固定。en/tl のチャット検索が日本語埋め込みに依存し、非日本語話者の RAG が実質機能していない。
- `conversations.updated_at` が message INSERT 時に touch されず、sidebar 並び順で直近会話が浮上しない。

### 1.4 設計書の是正(精査で判明した事実誤認)

- 会話タイトル自動生成: handoff は Phase 2 候補としていたが実装済(陳腐化)。
- escalation score: 設計書 §2.2 は「score フィールド先行実装済」とするが、classifier は category enum のみ返却(`whitelist-llm.ts:38`)。score はゼロから実装、既存メッセージは遡及不能。
- expert マッチング: 設計書 §4 は `experts.category_id` 前提だが当該列は実在せず。マッチングは実質未実装、fallback は prefecture_base のみ。

---

## 2. 進め方の原則

- **M0 先行。** 本番の実害穴を機能追加より先に潰す。外部依存ゼロで即着手可能。
- **DDL 承認ゲート(Lesson 24)。** 本番DBへの ALTER/REVOKE/DROP は Claude が直接実行しない。検証 SQL 付きで提示し、ユーザが SQL Editor で実行。各 DDL 後に `information_schema` / `pg_policies` / `has_function_privilege` で verify。
- **commit 単位とガバナンス。** 各項目は feature ブランチ → PR → Vercel preview → main。各完了時に CLAUDE.md Part 2.3 の5役割監査(致命・高は実装で修正)をコミットメッセージに記載。
- **env / 秘密情報の保護(Lesson 26)。** `.env*` への書き込みは事前に存在確認、上書きフラグ無しの cp 禁止。
- **フラグ駆動の段階展開。** escalation 改善・Messenger・expert マッチングは env フラグ default false で実装先行し、外部依存が解けてから ON。ロールバックはフラグを false に戻すだけ。

---

## 3. マイルストーン全体像とスケジュール

内製で作り切れる M0-M2 は概算 7-9 週間(フルタイム換算)。M3 は外部依存律速。

技術的 critical path: P0-A(セキュリティ恒久化) → P0-B(CLI 移行・未適用検知) → P1-G(CI 品質ゲート) → P1-H(テストDB分離・統合/E2E)。

週割りの目安(1人フルタイム想定、外部待ちは並行消化):

- 第1週: M0(P0-A → P0-B → P0-C)。本番セキュリティ恒久化。
- 第2-4週: M1(P1-E → P1-G → P1-D → P1-F → P1-I → P1-H)。安全網と監査基盤。
- 第5-9週: M2(P2-J → P2-L → P2-M → P2-K)。内製機能の作り切り。
- 第10週以降: M3(P2-N → P2-O)。外部依存が解けた機能から個別着手。

---

## 4. 各項目の詳細設計

### M0 セキュリティ恒久化と再現可能性(約1週間)

#### P0-A セキュリティ恒久化マイグレーション 008(1.5人日)

目的: 本番で塞がっているが履歴に無い安全状態をコード化し、新環境での再オープンを防ぐ。匿名なりすまし穴(1.1-1)を本番に確実反映。

依存: なし。外部依存は DDL 実行承認のみ。

設計要点:
- データモデル: スキーマ変更なし。ポリシーと関数権限の是正のみ。
- DDL 内容: (a) `REVOKE EXECUTE ON FUNCTION increment_chat_usage, match_content, handle_new_user FROM anon, authenticated`(冪等)。(b) 4関数(`set_updated_at` / `handle_new_user` / `match_content` / `increment_chat_usage`)を `CREATE OR REPLACE` で `SET search_path = ''` 付与。(c) `profiles_self_update` / `inquiries_self_insert` / `consent_logs_self_insert` を DROP+CREATE し `(auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE` 述語を本番反映。
- 認可: REVOKE 後も app 経路は admin(service_role)client 限定。app 内に anon/authenticated の RPC 直叩きがゼロであることを再確認(回帰防止テストを P1-H で追加)。
- 異常系: SQL Editor 一括実行で末尾エラー時に先頭 DDL がロールバックされ Lesson 24 型事故が再発しうる。各 DDL 後に verify SQL を実行する手順で緩和。

成果物: `apps/v2/supabase/migrations/008_security_hardening.sql`、適用後 verify SQL(同ファイル末尾 or `supabase/tests/security.test.sql`)、`tasks/lessons.md` にドリフト是正記録。

完了基準: 本番 `pg_policies` に is_anonymous 述語、`has_function_privilege` で anon/authenticated EXECUTE=false、`proconfig` に search_path 反映を verify SELECT で確認。

#### P0-B Supabase CLI 移行 + 未適用検知ゲート(2人日)

目的: 「ファイル=適用済」を構造的に保証し、ドリフトを再発させない(Lesson 24/25 の根本対処)。

依存: なし。外部依存は CLI トークン付与。

設計要点:
- `apps/v2/supabase/config.toml` 作成(project_id=vawreuciwcdittxgdilc, ap-northeast-1)。
- 既存 001-007 を `schema_migrations` に baseline 登録(`supabase migration repair` 相当)。008 以降を `db push` 運用に乗せる。
- 起動時 schema assertion: `apps/v2/src/lib/supabase/health-check.ts` 新規。必須カラム欠落を起動時に検知。
- CI で migration 未適用・drift 検知(P1-G に統合)。
- 異常系: baseline 登録ミスで 008 が二重適用される懸念。repair 手順を慎重に検証。本番接続情報の CI 格納は gitleaks 通過確認必須。

成果物: `config.toml`、`health-check.ts`、CI の migration 検証ジョブ、`tasks/vercel-deploy-checklist.md` の migration 節更新。

完了基準: `schema_migrations` に 001-008 が baseline 登録され、未適用検知ジョブが緑。

#### P0-C 認証ハードニング + 匿名 purge(1.5人日)

目的: 本番稼働中アプリで効くローハンギングフルーツのセキュリティ・コスト対処。

依存: なし。FB email scope のみ審査後に後追い。

設計要点:
- Supabase Auth で `auth_leaked_password_protection`(HaveIBeenPwned)有効化。
- `email-password-form.tsx` の `MIN_PASSWORD_LENGTH` を 6→8 へ引き上げ + 3言語コピー更新。
- 匿名 purge: `scripts/purge-anon-users.ts`(`is_anonymous=true AND created_at < now()-interval`、保持期間 env 化)+ cron 化。実行前に FK CASCADE を dry-run 確認。
- FB OAuth の email scope 復活(`login-form.tsx` の TODO 解消)は Standard Access 審査通過後。

成果物: `purge-anon-users.ts`、cron 設定、パスワード長変更、(審査後)scope 更新。

完了基準: 漏洩 PW 保護が有効、匿名行が保持期間で自動削除、dry-run で CASCADE 影響を確認済。

### M1 可観測性と CI/CD の土台(約2-2.5週間)

#### P1-E Next 更新 + audit CI + Gemini コスト監視(2人日)

目的: proxy bypass 含む high 脆弱性の解消と、変動費 Gemini の上限制御。

依存: P1-G(CI 基盤)、P1-D(アラート送信先)。

設計要点:
- `package.json` の next を 16.2.6 以降へ更新 + lockfile 更新 + 回帰確認(typecheck/lint/test/build + auth/redirect/onboarding の E2E)。
- `pnpm audit --prod` を CI ジョブ化(high 検知で fail)。transitive low は可視化のみ。
- `gemini.ts` の token/latency console.log を集計シンク(構造化ログ or 軽量テーブル `gemini_usage`)へ接続。日次集計と閾値超過時 Sentry アラート。
- 異常系: Next minor 更新で proxy 挙動に破壊的変更がないか E2E 必須。audit fail 基準は high-only で常時赤を回避。

成果物: next 更新、CI の audit ジョブ、`gemini.ts` の usage シンク配線、`gemini_usage` の置き場。

完了基準: next が patch 版で稼働し proxy の認可境界が E2E 通過。high audit が緑。Gemini 使用量が日次で可視化されアラート発火を確認。

#### P1-G CI/CD 品質ゲート(2人日)

目的: main 直 push 即本番デプロイを止め、品質ゲートを強制。

依存: P0-B(migration 検知)、P1-E(audit ジョブ)。

設計要点:
- `.github/workflows/ci.yml` 作成(pnpm install → lint → typecheck → test → build → audit)。
- PR 必須チェック化(main 直 push → PR 運用、handoff §4 準拠)。
- vitest coverage 設定追加(初期は計測のみ、閾値は段階導入)。
- 異常系: 既存テストの live Gemini skip 前提(`RUN_LIVE_GEMINI` gate)を CI で維持。

成果物: `ci.yml`、`vitest.config.ts` の coverage 設定、checklist 更新。

完了基準: lint/typecheck/test/build/audit が緑でないと main マージ不可。

#### P1-D Sentry 本番稼働 + PII フィルタ + persist 失敗送信 + 構造化ログ(3人日)

目的: サイレント壊れ(Lesson 25)の再発防止と本番オンコール追跡性の確保。

依存: P0-B(health-check / 構造化ログ土台)。外部依存は Sentry プロジェクト作成・DSN 発行。

設計要点:
- `validate.ts` の SENTRY_* を optional → required(preview/dev は条件分岐で optional 維持)。
- 3 init(server/edge/instrumentation-client)に `beforeSend` 追加。既存 `detectPii` 流用で chat 本文・email 等をマスク。Replay は PII リスクで無効維持。
- `route.ts:116-122` の persist 失敗 catch に `Sentry.captureException` + 構造化ログ(request_id/user_id/conversationId/period)。
- `global-error.tsx` と `[locale]/error.tsx` / `loading.tsx` / `not-found.tsx` 追加(3言語エラーUI + Sentry 捕捉経路)。
- 最小の構造化ログユーティリティ(`lib/log/structured.ts`、request_id 付与)を chat send 経路へ配線。
- 異常系: beforeSend の PII フィルタ漏れ防止に beforeSend テスト必須。

成果物: 3 config の beforeSend、chat send route の catch 改修、エラーバウンダリ群、`structured.ts`、todo B-7 消化。

完了基準: 本番 Sentry が PII マスク済でエラー捕捉、persist 失敗がアラート化、3言語エラーUIが表示。

#### P1-F whitelist_decision 保存配線 + classifier score 化(3人日)

目的: エスカレ監査証跡を残し、escalation 改善1(累積スコア)の前提を作る。

依存: なし。

設計要点:
- データモデル: `messages.whitelist_decision` JSONB に category/reason/escalation 理由 + `escalation_score`(0.0-1.0)を保存。新規カラム追加なし。
- API 契約: `persistResult`(`persistence.ts:258`)と `route.ts:108` に `whitelistDecision` 引数を配線。`whitelist-llm.ts` の ClassifierResponseSchema に `escalation_score: number` 追加、Stage2 LLM 出力に組込。
- env: `ESCALATION_SCORE_THRESHOLD` / `ESCALATION_SCORE_DECAY` / `ESCALATION_USE_CUMULATIVE_SCORE` を validate.ts に追加。
- 異常系: score 追加で Stage2 の MAX_TOKENS 切れ頻度が上がりうる(token 配分再調整)。既存メッセージは score=null=遡及不能(累積判定の初期は実質単一ターン等価)。
- 設計書 §2.2 の記述を実スキーマに合わせ修正。

成果物: persistence.ts / chat send route / whitelist-llm.ts / validate.ts の改修、設計書修正、score/persist 配線テスト。

完了基準: 本番で whitelist_decision に score/category/reason が実保存され、/admin/metrics で観察可能。

#### P1-I 記事/FAQ 自動 reindex + 多言語 RAG(2.5人日)

目的: RAG silent staleness の解消と、en/tl 利用者の検索を機能させる。

依存: なし。外部依存は en/tl 実コンテンツ投入。

設計要点:
- admin の articles/faqs の POST/PATCH/DELETE から `reindexArticle` / `reindexFaq` を呼ぶ(revalidate と同位置)。
- `reindex.ts` の embedChunks を body_ja/en/tl・question_ja/en/tl 対応に拡張(`content_embeddings.language` 分岐)。
- DELETE→INSERT の非 tx リカバリ手順整備(単一 writer 前提 + 失敗時 reindex CLI フォールバック)。
- 異常系: 公開時の同期 reindex が admin 保存レイテンシ増(失敗を non-fatal + 非同期化を検討)。en/tl body 未投入のまま回すと空 embedding(投入順序を運用で同期)。

成果物: admin articles/faqs ルートの reindex 配線、reindex.ts 多言語対応、運用 Runbook。

完了基準: 記事公開で RAG に即反映、en/tl クエリが各言語 embedding を参照。

#### P1-H テストDB分離 + route 統合テスト + E2E 拡充(4人日)

目的: 以降の機能改修の回帰を自動検知する受け皿。E2E が本番 env 共有の解消。

依存: P0-B(CLI/test DB)、P1-G(CI 実行エントリ)。外部依存は test DB 用 Supabase project/branch 作成。

設計要点:
- Supabase test DB 分離(別 project or branch DB)+ E2E global-setup を test DB 向けに切替。
- route 統合テスト基盤で chat/send・admin CRUD・consent/onboarding の認可・エラー系を検証(`RUN_LIVE_GEMINI` gate 流用)。
- E2E 拡充(login / admin CRUD / escalation 表示)。`rls.test.sql` の CI 実行化。
- 異常系: test DB の seed/teardown が本番 schema と drift しないよう P0-B の CLI で schema 同期。

成果物: test DB 接続設定、route 統合テスト群、E2E spec 追加、CI への E2E/RLS ジョブ統合。

完了基準: critical path の認可・エラー系が CI で自動検証、RLS が CI で緑。

### M2 内製機能の作り切り(約4-5週間)

#### P2-J 飲食店カタログ(機能7)(5人日)

目的: Phase 1 積み残しの作り切り。要件 v3 機能7(運営選定型カタログ、ユーザ投稿なし)。

依存: P1-G(CI)、型再生成。外部依存は掲載店舗の選定データ(経営)。

設計要点:
- 既存資産: `restaurants` テーブル / RLS public read / proxy 許可 / categories 行は既存、行0。
- 公開: `[locale]/restaurants/page.tsx`(一覧、prefecture/cuisine フィルタ、ISR、ロケール別 pick、空状態、loadError)+ `[id]/page.tsx`(詳細)。articles 雛形を流用。
- admin: `/admin/restaurants` 一覧/new/edit + `/api/admin/restaurants`(experts CRUD パターン流用、3言語フィールド、PREFECTURES select、is_active Switch、https URL バリデーション、requireEditor/requireAdmin ガード)。
- next/image 初導入(photo_url)。`next.config.ts` の `images.remotePatterns` 設定必須。
- データモデル: 既存 restaurants を使用。シード SQL で運営選定店舗を投入。
- i18n: messages 3言語に restaurants namespace 追加。`database.ts` 型再生成。

成果物: 公開ページ、admin CRUD、シード、restaurant card コンポーネント、3言語コピー、型再生成。

完了基準: 3言語で公開閲覧、admin 入稿で稼働、画像表示が remotePatterns 設定で動作。

#### P2-L escalation 改善 1+2+4(7人日)

目的: エスカレ精緻化のうち外部データ非依存の3案。全て env フラグ default false。

依存: P1-F(score 配線が前提)、P1-H(回帰 E2E)。外部依存は弁護士回答(ON 判断のみ、実装は先行可)。

設計要点:
- 改善1(累積スコア): 純粋関数 `cumulativeEscalationScore(scores, decay)` + 履歴取得を score 付きに拡張 + 閾値判定を chat-pipeline に組込(`ESCALATION_USE_CUMULATIVE_SCORE`)。減衰 0.6 / 閾値 1.5 は暫定、2週間メトリクス観察で確定。
- 改善2(Continue 動線): `EscalationCard.tsx` に Continue ボタン + ChatShell に minimize/cooldown(前回エスカレから3ターン以内は非表示、`ESCALATION_SHOW_CONTINUE_BUTTON`)。
- 改善4(PII Mask): 純粋関数 `maskPii(text, detections)` + chat-pipeline preflight に `pii_handling:'block'|'mask'` 分岐 + Radix Dialog 確認モーダル + `whitelist_decision.pii_masked` 保存(`PII_ALLOW_MASK_CONTINUE`)。オリジナル PII 文章は DB 保存しない。
- 認可: 既存 requireAuth + quota を継承。
- 異常系: 弁護士が累積判定を非弁リスクと判断した場合はフラグ OFF で本番影響を遮断。mask で意味消失時は disclaimer 付与。

成果物: 純粋関数群、EscalationCard/ChatShell 改修、chat-pipeline 分岐、4フラグ、unit + e2e。

完了基準: 3案がフラグで切替可能、弁護士回答後に ON 判断。

#### P2-M operator 介入UI + operator ロール正式化 + 問い合わせ first-party 化(6人日)

目的: 既存DB土台を活かした人間介入と、エスカレ証跡の first-party 化。

依存: P1-D(Sentry/ログ)、P2-K(channel 統合表示)。外部依存なし。

設計要点:
- 既存資産: `conversations.mode='operator'` / operator_user_id / operator_started_at、`operator_takeover_logs`、`messages.role='operator'`、部分 index は既存。
- データモデル: `admin_roles` の CHECK に 'operator' 追加(migration)。必要に応じ担当割当カラム。
- 認可: `require-admin.ts` の `requireOperatorRole()` を実体化(現状 requireAdmin 別名)。
- UI: admin 会話一覧 → takeover → operator メッセージ送信(`operator_takeover_logs` に action 記録、mode 切替)。`chat/page.tsx:67` の operator→assistant 暫定マップを正式表示へ。
- inquiries first-party 化: `/contact` の Google Form iframe を inquiries INSERT 経路へ(EscalationCard の Contact から inquiry 作成)+ admin 受信箱 UI。
- 異常系: takeover 中の SSE auto 応答との競合 → mode='operator' 時は pipeline 停止ガード。inquiries の PII(連絡先)保持で RLS/保持期間方針を弁護士 §6-3 と確認。

成果物: migration(CHECK 拡張)、operator ロール実体化、介入UI、inquiry フォーム + API、admin 受信箱、chat 表示差し替え。

完了基準: 会話 takeover と operator 認可が動作、問い合わせがDB一次データ化。

#### P2-K Messenger Bot 連携(6人日)

目的: ユーザ指示で Phase 2 必須。Web のチャットパイプラインを Messenger に橋渡し。

依存: P1-F(decision 保存=Messenger 経路でも監査証跡)、P1-D(Sentry/ログ)。外部依存は FB 公開モード移行 + pages_messaging 等の審査(本番送信のみ)。

設計要点:
- 既存資産: env 3点(MESSENGER_*)、`conversations.channel='messenger'`、`messenger_links`(PSID UNIQUE)、`webhook_logs`(source='messenger', idempotency UNIQUE)、persistence の channel 引数。webhook ルート・署名検証・送信は未実装。
- API 契約: `/api/messenger/webhook`(GET verify challenge with MESSENGER_VERIFY_TOKEN、POST 受信)。
- 認可: X-Hub-Signature-256 署名検証(MESSENGER_APP_SECRET、HMAC-SHA256、定数時間比較、raw body 保持)。
- 処理フロー: 受信 → `webhook_logs` で idempotency → `messenger_links` で PSID↔user 解決(未紐付けはオンボーディング誘導)→ chat-pipeline 実行 → Graph API で返信(MESSENGER_PAGE_ACCESS_TOKEN)→ channel='messenger' で永続化。
- env: MESSENGER_* を messenger 有効時 required 化する分岐。
- 異常系: 署名検証ミスで偽 webhook 受信を防止。FB 審査長期化に備え、署名検証・idempotency・pipeline 接続は FB 非依存で先行実装し test DB で検証。PII 検出が Messenger 経路でも preflight を通る。

成果物: webhook route、`lib/messenger/`(署名検証、Graph API 送信、PSID 解決)、webhook_logs/messenger_links 配線、env 分岐、unit テスト。

完了基準: 署名検証/idempotency/pipeline 接続が test DB で検証済。FB 公開モード移行後に本番送信 ON。

### M3 外部依存解消後の機能(外部依存律速)

#### P2-N escalation 改善3 専門家 embedding マッチング(8人日)

目的: テーマ別の専門家マッチング精度向上。記事 RAG と同パターン。

依存: P0-A(REVOKE/search_path パターン)、P1-I(自動 reindex 配線)、P2-J(next/image)。外部依存は experts 実データ(協業5社)、弁護士 §3(紹介有償化の規制は予約モデルに影響、マッチング表示自体は内製可)。

設計要点:
- データモデル: `experts.bio_embedding VECTOR(768)` 追加 + `match_experts` RPC(SECURITY DEFINER、cosine、threshold/count、`SET search_path=''`、REVOKE)+ hnsw index(expert 側は hnsw、content は ivfflat 維持、設計判断としてコメント明記)。
- API: `findExpertsForMessage(message, locale, limit)` → embed → match_experts → JOIN → 上位3件、失敗時 prefecture_base へ degrade。
- 再 indexing: `scripts/reindex-experts.ts`。admin expert 追加/編集時に bio 自動 embedding(P1-I パターン)。
- EscalationCard の全件 fetch を findExpertsForMessage へ差し替え(`EXPERTS_USE_EMBEDDING_MATCH`)。
- 設計書 §4.1 の category_id 前提を実スキーマ(prefecture_base のみ)に修正。
- 異常系: experts 0行のまま先行実装してもデータ無しで検証不能 → 実データ投入とスキーマ着手を同期。

成果物: expert embedding migration、`find.ts`、reindex-experts.ts、EscalationCard 差し替え、admin embedding 自動化、設計書 §4 修正。

完了基準: 専門家データ投入後、マッチングが上位3件を返し EscalationCard に反映。

#### P2-O 要件 v3 Phase 2 4本柱(外部依存項目)

目的: 事業ロードマップ項目。依存解消トリガで個別設計 → 実装。

依存・外部依存: 弁護士回答(不動産=宅建業法/送客手数料 §1-4、社労士税理士=独占業務境界 §1-3、紹介有償化 §3)、協業データ、経営判断、仕様確定(通訳予約・書類翻訳は設計書なし)。

内容:
- 不動産紹介(広告掲載型): restaurants を雛形に listings 系テーブル新規設計(掲載ステータス/有料枠/掲載期間/掲載者)+ 公開閲覧 UI。
- 通訳予約・書類翻訳: 仕様確定後にスキーマ/予約フロー設計。
- 社労士税理士本格運用: P2-N の expert 基盤へカテゴリ別データ投入 + 機能2 個別対応強化。
- コミュニティ機能: Facebook Group 連携 or 限定掲示板の方式選定後に設計。

完了基準: 依存が解けた機能から個別に設計書 → スキーマ → 実装。本項目は計画上のプレースホルダ。

リスク: 4本柱を内製スプリント(M0-M2)に混ぜると律速・スコープ流動化。別レーンで管理する。弁護士回答前に不動産送客手数料モデルを実装すると業法違反リスク。

---

## 5. 経営側アクションのタイムライン

各マイルストーンの着手に必要なユーザ側作業。番号は推奨着手順。

M0 着手まで:
1. 本番DDL の実行承認(P0-A、Lesson 24。私が用意した 008 SQL を SQL Editor で実行)。
2. Supabase CLI 接続トークンの付与(P0-B)。
3. 漏洩 PW 保護の Dashboard 有効化と匿名 purge 保持期間の方針決定(P0-C)。

M1 着手まで:
4. Sentry プロジェクト作成と DSN 発行(P1-D)。
5. test DB 用 Supabase project/branch の作成承認(P1-H、コスト判断)。
6. main 直 push → PR 運用への移行とブランチ保護の承認(P1-G)。

M2 着手まで:
7. 飲食店の掲載店リスト(P2-J)。
8. Facebook App 公開モード移行 + Messenger permission 審査の発信(P2-K 本番送信)。

M3 着手まで:
9. 弁護士監修回答の確定(escalation 改善1/4、不動産、社労士税理士、PII マスク許容範囲)。
10. 協業企業5社の専門家実データ(P2-N)。

---

## 6. リスク台帳と回避策

- 本番 DDL 一括実行の末尾エラーで先頭 DDL がロールバック(Lesson 24 型)→ 各 DDL 後に verify SQL、可能なら分割実行。
- Next 更新で proxy 挙動の破壊的変更 → 更新後に auth/redirect/onboarding の E2E 必須(P1-H と連動)。
- Sentry beforeSend の PII 漏れ → beforeSend 専用テストで担保。
- escalation score 追加で MAX_TOKENS 切れ増 → token 配分再調整、failsafe は安全側(escalate)。
- Messenger 署名検証ミスで偽 webhook → HMAC 定数時間比較・raw body 保持・idempotency。
- experts 0行で先行実装すると検証不能 → 実データ投入とスキーマ着手を同期。
- 「Phase 2」のスコープ混在 → 内製(M0-M2)と外部依存(M3)を2レーン分離(本計画で対応済)。

---

## 7. スコープ境界

- Komoju 課金: スコープ外。将来フックのみ温存、再開時に `NEXT_PUBLIC_PAYMENT_ENABLED` を flip。
- 要件 v3 4本柱: M3 の外部依存レーン。内製スプリントに混ぜない。
- Messenger: 内製部(署名検証・idempotency・pipeline 接続)は M2 で先行、本番送信は FB 審査後。

---

## 8. 次の一手

M0 から着手する。最初の具体作業は P0-A の設計フェーズ文書 + `008_security_hardening.sql`(REVOKE + search_path + 007 ドリフト是正)の作成と、本番適用・検証手順の提示。DDL はユーザが SQL Editor で実行(承認ゲート)。
