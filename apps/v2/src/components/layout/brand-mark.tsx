import { cn } from "@/lib/utils/cn";

// The MORITA mark: a white tile with a blue "M" and a sunflower underline,
// made to sit on the solid blue header and the dark footer. Purely
// decorative; the wordmark next to it carries the accessible name.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-card font-display text-lg leading-none font-extrabold text-primary",
        className,
      )}
    >
      M
      <span className="absolute bottom-[6px] left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-highlight" />
    </span>
  );
}
