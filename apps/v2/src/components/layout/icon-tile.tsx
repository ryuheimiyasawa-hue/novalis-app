import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Lucide icon on a tinted square — the one way icons are presented across
// the product (stroke 1.75, soft indigo or soft mango surface).
const TONES = {
  primary: "bg-primary-soft text-primary",
  highlight: "bg-highlight-soft text-highlight-soft-foreground",
  caution: "bg-highlight-soft text-caution",
  success: "bg-success/10 text-success",
} as const;

const SIZES = {
  sm: "size-8 rounded-[8px] [&_svg]:size-4",
  md: "size-10 rounded-md [&_svg]:size-5",
  lg: "size-12 rounded-md [&_svg]:size-6",
} as const;

export function IconTile({
  icon: Icon,
  tone = "primary",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      <Icon strokeWidth={1.75} />
    </span>
  );
}
