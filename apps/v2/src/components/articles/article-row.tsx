import Link from "next/link";
import {
  BookOpenIcon,
  GraduationCapIcon,
  HeartPulseIcon,
  IdCardIcon,
  LandmarkIcon,
  ScaleIcon,
  UsersIcon,
  UtensilsCrossedIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

// One row of a Philstar / GMA style headline list: a square thumbnail on
// the left, then an uppercase category label, a bold two-line headline and
// a meta line (date, plus a NEW badge for fresh pieces). Articles have no
// image column, so the thumbnail is a soft tile in the category's tint
// with its icon. Shared by the articles page and the landing page's latest guides.

// Each category gets its own icon and its own soft tint, so a reader can
// pick out "visa" or "insurance" pieces by colour alone, the way Philstar
// colour-codes its sections. All tints are tokens (globals.css).
const TONES = {
  blue: "bg-primary-soft text-primary",
  green: "bg-success-soft text-success-soft-foreground",
  terracotta: "bg-caution-soft text-caution-soft-foreground",
  yellow: "bg-highlight-soft text-highlight-soft-foreground",
  slate: "bg-slate-soft text-slate-soft-foreground",
} as const;

const CATEGORY_LOOK: Record<string, { icon: LucideIcon; tone: keyof typeof TONES }> = {
  visa: { icon: IdCardIcon, tone: "blue" },
  social_ins: { icon: HeartPulseIcon, tone: "green" },
  family: { icon: UsersIcon, tone: "terracotta" },
  school: { icon: GraduationCapIcon, tone: "yellow" },
  admin_proc: { icon: LandmarkIcon, tone: "slate" },
  escalation: { icon: ScaleIcon, tone: "terracotta" },
  restaurants: { icon: UtensilsCrossedIcon, tone: "yellow" },
};
const DEFAULT_LOOK = { icon: BookOpenIcon, tone: "blue" } as const;

/** Published within this many days counts as new. */
export const FRESH_DAYS = 14;

export function isFresh(publishedAt: string | null, now: number): boolean {
  if (!publishedAt) return false;
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return false;
  const age = now - t;
  return age >= 0 && age <= FRESH_DAYS * 24 * 60 * 60 * 1000;
}

export function formatArticleDate(
  publishedAt: string | null,
  locale: "ja" | "en" | "tl",
): string {
  if (!publishedAt) return "";
  const tag = locale === "ja" ? "ja-JP" : locale === "tl" ? "en-PH" : "en-US";
  return new Date(publishedAt).toLocaleDateString(tag, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ArticleRow({
  href,
  title,
  categorySlug,
  categoryLabel,
  dateLabel,
  dateTime,
  fresh,
  newLabel,
  excerpt,
  compact = false,
}: {
  href: string;
  title: string;
  categorySlug: string | null;
  categoryLabel: string | null;
  dateLabel: string;
  dateTime: string | null;
  fresh: boolean;
  newLabel: string;
  excerpt?: string;
  /** Smaller thumbnail for the landing page list. */
  compact?: boolean;
}) {
  const { icon: Icon, tone } = (categorySlug && CATEGORY_LOOK[categorySlug]) || DEFAULT_LOOK;
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 py-4 transition-colors md:gap-5"
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-xl",
          TONES[tone],
          compact ? "size-[72px] [&_svg]:size-7" : "size-[72px] md:size-24 [&_svg]:size-7 md:[&_svg]:size-9",
        )}
      >
        <Icon strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {categoryLabel && <span className="kicker text-primary">{categoryLabel}</span>}
        <span className="line-clamp-2 font-display text-base leading-snug font-extrabold text-foreground group-hover:text-primary group-hover:underline md:text-lg">
          {title}
        </span>
        {excerpt && (
          <span className="hidden text-sm text-muted-foreground md:line-clamp-1">
            {excerpt}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          {fresh && (
            <span className="rounded-full bg-hot px-2 py-0.5 font-display text-[11px] leading-none font-extrabold tracking-wide text-hot-foreground uppercase">
              {newLabel}
            </span>
          )}
          {dateLabel && dateTime && <time dateTime={dateTime}>{dateLabel}</time>}
        </span>
      </span>
    </Link>
  );
}
