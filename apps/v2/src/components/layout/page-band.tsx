import type { LucideIcon } from "lucide-react";

// Blue title band for the content sections (articles, restaurants): it
// continues the solid blue of the header so the page reads as one surface,
// Philstar style, with white type. `top` holds a small back link.
export function PageBand({
  icon: Icon,
  kicker,
  title,
  description,
  top,
}: {
  icon?: LucideIcon;
  kicker?: string;
  title: string;
  description?: string;
  top?: React.ReactNode;
}) {
  return (
    <div
      data-surface="brand"
      className="bg-gradient-to-b from-primary to-primary-hover text-primary-foreground"
    >
      <div className="mx-auto max-w-[1120px] px-4 pt-4 pb-8 md:px-6 md:pt-6 md:pb-12">
        {top}
        <div className="mt-3 flex items-start gap-4 md:mt-5">
          {Icon && (
            <span
              aria-hidden
              className="hidden size-14 shrink-0 items-center justify-center rounded-2xl bg-card text-primary sm:inline-flex"
            >
              <Icon className="size-7" strokeWidth={1.75} />
            </span>
          )}
          <div className="min-w-0 space-y-2">
            {kicker && <p className="kicker text-highlight">{kicker}</p>}
            <h1 className="text-3xl md:text-4xl">{title}</h1>
            {description && (
              <p className="max-w-[680px] text-base text-primary-foreground/90 md:text-lg">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
