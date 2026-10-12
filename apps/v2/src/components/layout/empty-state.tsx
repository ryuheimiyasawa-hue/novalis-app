import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { IconTile } from "./icon-tile";

// Empty / error placeholder: icon, a sentence that says what happened and,
// where there is one, the next thing to do. Replaces the bare grey text
// lines the lists used to show.
export function EmptyState({
  icon,
  tone = "primary",
  title,
  description,
  action,
  role,
  className,
}: {
  icon: LucideIcon;
  tone?: "primary" | "highlight" | "caution" | "success";
  title: string;
  description?: string;
  action?: React.ReactNode;
  role?: "status" | "alert";
  className?: string;
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-border bg-card px-6 py-12 text-center shadow-card",
        className,
      )}
    >
      <IconTile icon={icon} tone={tone} size="lg" />
      <div className="max-w-md space-y-1">
        <p className="text-base font-bold">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
