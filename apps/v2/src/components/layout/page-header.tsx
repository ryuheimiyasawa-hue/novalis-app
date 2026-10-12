import type { LucideIcon } from "lucide-react";
import { IconTile } from "./icon-tile";

// Heading block shared by the content pages (articles, restaurants,
// contact, legal …) so the h1, its lead and the spacing below are the same
// everywhere.
export function PageHeader({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 pb-8 md:flex-row md:items-start md:gap-5">
      {icon && <IconTile icon={icon} size="lg" />}
      <div className="min-w-0 space-y-2">
        {eyebrow && (
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {description && (
          <p className="max-w-[680px] text-base text-muted-foreground">
            {description}
          </p>
        )}
        {children}
      </div>
    </header>
  );
}
