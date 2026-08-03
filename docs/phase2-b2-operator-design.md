# P2-B2 operator 介入 — 設計書（design-gate 10項目）

_作成: 2026-08-03 / 状態: **承認済み（§10 の a/b/c を回答済み、実装着手可）**_

対象は「運営が特定の会話で AI を止め、人間として返信する」機能。DB 土台（`conversations.mode` / `operator_user_id` / `operator_started_at` / `messages.role='operator'` / `operator_takeover_logs`）は migration 001 で既に存在し、アプリ層が完全に未配線という状態から始める。

---

## 1. 機能仕様の確認と曖昧点（質問は §10 に集約）

確定している前提は次の通り。

運営は `/admin/conversations/[id]`（PR #15 の閲覧専用ビューア）から会話を開き、「対応を引き取る」で takeover する。takeover 中はその会話の AI 応答が完全に止まり、利用者が送った発言は保存されるだけで Gemini を呼ばない。運営が本文を書いて送ると `messages.role='operator'` として保存され、利用者のチャット画面に現れる。運営が「対応を終える」で release すると `mode='auto'` に戻り、以降は従来通り AI が答える。takeover と release は `operator_takeover_logs` に証跡が残る。

利用者側の表示は既存の暫定マップ（`chat/page.tsx:67` の operator→assistant 読み替え）をやめ、運営発言と分かる見た目にする。

曖昧なまま進めない論点は §10 に列挙し、承認時に回答をもらう。

## 2. データモデル

**追加するもの**

migration 010 で `admin_roles` の CHECK 制約に `'operator'` を追加する（現在は `('admin','editor')`）。CHECK の差し替えは `DROP CONSTRAINT` + `ADD CONSTRAINT` で、既存行は admin / editor のみなので違反行は出ない。前方互換（古いコードは operator 行を「未知のロール」として role !== 'admin' 判定で弾くだけ、権限昇格は起きない）、後方互換（ロールバックしたい場合は operator 行を削除してから CHECK を戻す）。

同じ migration で SECURITY DEFINER 関数 `operator_takeover(p_conversation_id, p_operator_user_id, p_reason)` と `operator_release(p_conversation_id, p_operator_user_id)` を追加する。理由は §5 に書く通り「mode 更新と証跡 INSERT を 1 トランザクションに閉じ、同時 takeover を DB 側で排他するため」。P0-A の方針に従い `SET search_path = ''` を付け、EXECUTE を PUBLIC / anon / authenticated から REVOKE して service_role のみに残す。

**変更しないもの**

`conversations` と `messages` と `operator_takeover_logs` はカラム追加不要。`operator_takeover_logs.action` の CHECK は `('takeover','release')` で足りる。

**インデックス**

新規は不要と判断する。利用者側ポーリングの差分取得は既存 `idx_messages_conversation (conversation_id, created_at)` がそのまま効く。admin 一覧の「運営対応中」絞り込みは既存の部分 index `idx_conversations_mode WHERE mode='operator'` が効く。

## 3. API 契約

すべて既存の `ok()` / `fail()` エンベロープ（`lib/api/response.ts`）を経由する。直接 `NextResponse.json` しない。

**運営側（`requireOperatorRole()` で認可）**

`POST /api/admin/conversations/[id]/takeover`。ボディは `{ reason?: string (max 500) }`。成功時 `{ mode: 'operator', operatorUserId, operatorStartedAt }`。エラーは 400 INVALID_INPUT（id が UUID でない / reason 超過）、401 UNAUTHORIZED、403 FORBIDDEN（ロール不足）、404 NOT_FOUND（会話なし）、409 CONFLICT（別の運営が対応中）、500 INTERNAL_ERROR。

`POST /api/admin/conversations/[id]/release`。ボディなし。成功時 `{ mode: 'auto' }`。エラーは上記に加えて 409 CONFLICT（自分が担当でない会話を release しようとした。admin は強制解除可、詳細は §6）。

`POST /api/admin/conversations/[id]/messages`。ボディは `{ content: string (1..2500) }`。成功時 `{ id, createdAt }`。エラーは 400、401、403、404、409 CONFLICT（`mode !== 'operator'`、つまり takeover していない会話に送ろうとした）、500。

**利用者側（`requireAuth()` + 所有者チェック）**

`GET /api/chat/conversations/[id]/updates?after=<ISO8601>`。成功時 `{ mode: 'auto'|'operator', messages: [{ id, role, content, isEscalated, citations, createdAt }] }` で、`after` より新しい行のみを昇順・最大 50 件返す。`after` 省略時は空配列と現在の mode だけ返す（全文取得は既存の `/messages` の役割で、こちらは差分専用）。エラーは 400 INVALID_INPUT（id / after が不正）、401、403（他人の会話）、404、500。

既存 `POST /api/chat/send` の契約を 1 つ拡張する。会話が `mode='operator'` のとき、SSE は開くが token を一切流さず、最終イベントを `{ type:'done', kind:'operator_pending', text:<運営対応中の案内文>, userMessageId }` にする。クライアントの done ハンドラは discriminated union なので、未知 kind を無視する既存実装でも壊れない。

## 4. 状態遷移と副作用

会話の mode は `auto → operator`（takeover）と `operator → auto`（release）の 2 遷移のみ。takeover は `mode='auto'` の行だけを対象にし、release は `mode='operator'` かつ担当者一致（または admin）の行だけを対象にする。

書き換えるデータは `conversations.mode / operator_user_id / operator_started_at`、`operator_takeover_logs` への 1 行 INSERT、`messages` への 1 行 INSERT の 3 種類のみ。

外部への副作用はゼロ。takeover 中は Gemini を呼ばないので AI コストも増えない。メール・Slack 送信もこの機能では行わない（通知は §10 の未確定事項）。

冪等性は次の通り。同じ運営が既に担当している会話への takeover 再送は 200 を返し、証跡ログは追加しない（`mode='auto'` の行だけを更新する条件付き UPDATE が 0 行になり、担当者一致なら成功扱いに落とす）。release も同様に、既に `auto` なら 200 で証跡は追加しない。運営メッセージ送信は冪等ではない。二重送信は二重投稿になるので、UI 側で送信中ボタン無効化＋楽観 clear で防ぐ（DB 制約は張らない、§7-7 参照）。

## 5. トランザクション境界とロールバック範囲

takeover / release は「mode の更新」と「証跡の INSERT」が必ず一致していなければ監査として無意味になる。アプリ側で 2 回に分けて呼ぶと、UPDATE 成功・INSERT 失敗で「証跡なしに AI が止まった会話」が生まれる。したがって両方を 1 つの SQL 関数に閉じ、Postgres の単一トランザクションで実行する。関数内は条件付き UPDATE（`WHERE id=? AND mode='auto'`）→ 更新行があれば INSERT、なければ何も書かずに現在の担当者を返す、という順序にする。行ロックは条件付き UPDATE が取るので、明示的な `SELECT FOR UPDATE` は不要。

運営メッセージ送信は `messages` への単一 INSERT なので、トランザクション境界の議論は発生しない。ただし「送信前に mode を確認 → INSERT」の間に release が挟まる競合はあるため、`mode='operator'` の再確認を INSERT と同じ関数に入れるか、という判断が残る。ここは INSERT 前チェックのみとし、競合時に運営の 1 通が release 後に着弾する可能性を許容する（利用者に見えるのは「運営の最後の一言」で、実害がない）。この判断はコードのコメントに残す。

外部副作用はトランザクション内に存在しない。

## 6. 認可ポリシー

運営側 3 エンドポイントはすべて `requireOperatorRole()` を通す。現在この関数は `requireAdmin()` の別名なので、admin_roles に `'operator'` を追加した上で「admin または operator」を通す実体に差し替える（editor は通さない。編集者は CMS 担当であり、利用者との直接対話の権限とは別物）。

会話単位の権限判定は次の 2 段。takeover は「担当者が未設定であること」を DB の条件付き UPDATE で保証する。release と運営メッセージ送信は「`conversations.operator_user_id` が自分であること」を条件にする。ただし admin は他人の担当会話も強制 release できる（担当者が離席したまま戻らないケースの復旧手段が他にないため）。強制解除も `operator_takeover_logs` に `action='release'` と `reason='forced by admin'` 相当で残す。

利用者側の `updates` エンドポイントは `requireAuth()` に加えて `conversations.user_id === 自分` を必ず確認する。既存 `/messages` と同じ形。テナント越境はこの所有者チェック 1 点で防ぐ（admin client を使うため RLS は効かない前提で、コード側で必ず確認する。W3 Lesson 9 の多層防御方針に従い、RLS 側の `messages_own` ポリシーも維持する）。

匿名ユーザーは 007/008 のハードニングで対象外。運営が匿名ユーザーの会話を takeover すること自体は可能だが、そもそも匿名では会話が続かないので運用上発生しない。

## 7. 異常系シナリオ

**1. DB 接続断（takeover の途中）**。SQL 関数が 1 トランザクションなので、mode だけ変わって証跡が無い状態は生まれない。アプリは 500 INTERNAL_ERROR を返し、運営は再試行する。再試行は冪等（§4）なので二重証跡にならない。

**2. 2 人の運営が同時に takeover**。条件付き UPDATE `WHERE mode='auto'` により、後着は 0 行更新になる。関数は現在の担当者 id を返し、アプリは 409 CONFLICT と「担当: ◯◯」を返す。楽観ロックの再実装は不要。

**3. takeover 中に利用者が送信**。`/api/chat/send` が mode を読み、`operator` なら Gemini を呼ばず user メッセージのみ保存し、`kind='operator_pending'` を返す。クォータは消費しない（AI コストが発生していないため）。利用者の UI には「運営が対応しています」と表示する。

**4. 利用者の送信と takeover がほぼ同時**。send 側が mode を読んだ直後に takeover が確定した場合、AI 応答が 1 通だけ流れる。これは許容し、設計書とコードコメントに明記する。運営は会話ビューアで AI の発言をそのまま見られるので、齟齬は目視で解消できる。厳密に潰すには LLM 呼び出し直前の再確認かアドバイザリロックが要るが、ベータ規模の発生確率に対して複雑さが見合わない。

**5. ポーリング中のセッション切れ（401）/ 他人の会話（403）**。ポーリングを即停止し、再ログイン導線を出す。401 で無限リトライしない。

**6. ポーリングのネットワーク断・5xx**。指数バックオフ（初回 5 秒 → 最大 60 秒）。連続 5 回失敗でポーリングを止め、「接続できません。再読み込みしてください」を表示する。タブが非表示（`document.hidden`）の間はポーリングしない。

**7. 運営の二重送信（リトライ・ダブルクリック）**。同じ本文が 2 行入る。UI の送信中無効化で防ぐ。DB に冪等キーを持たせない理由は、人間の運営が意図的に同じ短文（「はい」等）を連投する正当なケースがあり、unique 制約が誤検知するため。

**8. 不正入力**。`content` は Zod で trim 後 1〜2500 文字。空文字・空白のみ・null は 400。制御文字は保存するが表示側でエスケープ（React の既定挙動）。Unicode（絵文字・タガログ語の合字）は TEXT 列なのでそのまま通る。`after` は ISO8601 として parse できなければ 400。

**9. release 忘れで会話が永久に AI 停止**。この機能の最大の運用リスク。自動 release の要否は §10 の未確定事項とする。当面は admin 一覧に「運営対応中」の件数と経過時間を出して目視で気付ける形にする。

**10. 運営メッセージ内の PII**。運営が利用者の氏名や連絡先を本文に書く可能性がある。AI 出力用の `maskOutputPii` は通さない（人間の意図的な記述をマスクすると会話が成立しない）。保持方針は弁護士確認事項（masterplan §6-3）に連なるので、現時点では「保存する」とし、方針確定後に見直す。

## 8. パフォーマンス想定

想定 QPS はベータ 20 名規模で極小。支配的なのはポーリングなので、そこだけ見積もる。

ポーリングは「チャット画面を開いていて、かつタブが可視で、かつ会話が存在する」ときだけ動かす。さらに `mode='auto'` かつ直近がエスカレでない通常時は 30 秒間隔、`mode='operator'`（運営対応中）は 5 秒間隔に上げる。20 名が同時に常時開いていても通常時 40 req/分、全員が運営対応中という最悪ケースでも 240 req/分。1 リクエストは「conversations 1 行 + messages の index range scan」で、いずれも主キー / 既存 index を使う。N+1 は発生しない。

データが 10 倍（200 名同時）になると最悪 2,400 req/分 = 月 100 万リクエスト級になり、Vercel の関数呼び出し課金が現実的な議論になる。その規模に達する前に Supabase Realtime へ移行する分岐点を設ける（§10）。今は「realtime を入れるコストより、10 行のポーリングで確実に動く方が先」という判断。

許容レイテンシは、運営の返信が利用者に見えるまで最大 5 秒（ポーリング間隔）。人間同士のやり取りとしては十分。

既知の未対処として、`updates` エンドポイント自体にレート制限は無い。認証済みユーザーが自作クライアントで高頻度に叩けば呼び出し回数を消費できる。ただし既存の `/messages` や `/conversations` も同じ性質で、1 リクエストの実コストが主キーと既存 index だけの参照であるため、この機能の固有リスクとしては扱わない。実ユーザー起因の異常を観測したら Vercel 側のレート制限で対処する。

## 9. テスト方針

単体（vitest、DB モック）で必ず覆うのは、takeover / release の可否を判定する純粋関数（担当者一致・admin 強制解除・既に auto などの分岐）、Zod スキーマの境界値（0 文字・2500 文字・2501 文字・空白のみ・不正 UUID・不正 ISO 日付）、ポーリングのバックオフ間隔を返す純粋関数、`kind='operator_pending'` を含む done イベントの分岐。W3 Lesson 14 の方針通り、判定ロジックは route の外に純粋関数として切り出してからテストする。

実機検証は Supabase MCP の `execute_sql` を使い、トランザクション内で「2 セッションからの同時 takeover で後着が 0 行更新になる」ことと、「SECURITY DEFINER 関数の EXECUTE が anon / authenticated から REVOKE されている」ことを確認する。ロールバックして戻すので本番データは汚さない。

カバレッジ対象外は、認証付きのブラウザ E2E（ローカルに本番 env が無く実行不可という既知の制約）と、ポーリングの実時間挙動（タイマーを実測するテストは脆いので、間隔計算の純粋関数までをテスト範囲とする）。UI の見た目は Vercel プレビューで目視確認する。

## 10. 未確定事項と決定（2026-08-03 回答済み）

**a. 配信方式 → 可変間隔ポーリングを採用**。Supabase Realtime はチャネル購読の認可と RLS を再設計する必要があり、認可面の検討量がポーリングの数倍になる。5 秒遅延は人間同士の会話では体感差にならない。200 名規模に達した時点で Realtime への移行を再検討する。

**b. operator ロール → 新設しない。当面 admin のみ**。`requireOperatorRole()` は現状どおり `requireAdmin()` の別名のまま据え置く。`admin_roles` の CHECK 変更は行わない。将来スタッフを分離する必要が出たら CHECK 拡張だけで足りる（この判断を `require-admin.ts` のコメントに残す）。

**c. 自動 release → 実装しない。目視運用**。cron による自動解除は「運営が返信を準備している最中に AI が勝手に再開する」事故を生む。代わりに admin の会話一覧と会話詳細に「運営対応中」の経過時間を出し、放置に気付ける形にする。

この決定により migration 010 の中身は SQL 関数 2 本（`operator_takeover` / `operator_release`）と、その EXECUTE 権限の REVOKE のみになる。`admin_roles` の CHECK 変更は含めない。

**d. 通知**。takeover すべき会話（エスカレが起きた会話）を運営がどう知るか。今回は「admin 一覧を見に行く」だけとし、Slack 通知は PR #12 の仕組みを流用して別タスクにする想定。

**e. Messenger チャネルの会話**。`channel='messenger'` の会話に takeover した場合、運営の返信を Messenger 側へ送り返す経路が別途必要になる。今回は web チャネルのみを対象とし、messenger の会話は admin UI で takeover ボタンを無効化する想定。

**f. 運営メッセージの保持・PII 方針**。弁護士回答待ち（§7-10）。現時点は「そのまま保存」で進める。
