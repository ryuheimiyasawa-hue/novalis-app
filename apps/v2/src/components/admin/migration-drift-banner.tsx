import { checkMigrationDrift } from "@/lib/supabase/migration-drift";

// P0-B. Shown on every admin page because the two incidents this
// guards against (Lesson 24, Lesson 27) both went unnoticed for days —
// a signal you have to remember to go look at is not a signal.
//
// Async server component: safe to drop into the admin layout, and
// checkMigrationDrift never throws, so a database hiccup degrades to the
// "unknown" notice instead of taking the console down.
export async function MigrationDriftBanner() {
  const status = await checkMigrationDrift();

  if (status.state === "ok") return null;

  if (status.state === "unknown") {
    return (
      <div className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        マイグレーションの適用状況を確認できませんでした（{status.reason}）。
        011_applied_migrations_reader が未適用だとこの表示になります。
      </div>
    );
  }

  const { missing, unexpected } = status.drift;
  return (
    <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
      <p className="font-semibold text-red-700 dark:text-red-400">
        本番 DB に未適用のマイグレーションがあります
      </p>
      <p className="mt-1">
        このビルドが前提にしているスキーマが DB に存在しません。該当機能は
        保存に失敗するなどの形で静かに壊れている可能性があります:{" "}
        <span className="font-mono">{missing.join(", ")}</span>
      </p>
      {unexpected.length > 0 && (
        <p className="mt-1 text-muted-foreground">
          （DB 側にのみ存在: <span className="font-mono">{unexpected.join(", ")}</span>
          。デプロイ途中なら正常です）
        </p>
      )}
    </div>
  );
}
