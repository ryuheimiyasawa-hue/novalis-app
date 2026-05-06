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
