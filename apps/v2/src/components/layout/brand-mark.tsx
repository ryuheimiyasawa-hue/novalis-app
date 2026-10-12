import { cn } from "@/lib/utils/cn";

// The Novalis mark: an indigo tile with a mango underline under the "N" —
// the help-desk colour carrying a small piece of Philippine sun. Purely
// decorative; the wordmark next to it carries the accessible name.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-base leading-none font-bold text-primary-foreground",
        className,
      )}
    >
      N
      <span className="absolute bottom-[7px] left-1/2 h-[3px] w-3.5 -translate-x-1/2 rounded-full bg-highlight" />
    </span>
  );
}
