import Link from "next/link";
import {
  BookOpenIcon,
  LayoutDashboardIcon,
  MailIcon,
  UtensilsCrossedIcon,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils/cn";
import { BrandMark } from "./brand-mark";

export type SiteSection = "dashboard" | "articles" | "restaurants" | "contact";

// Shared top bar: the logo (home for visitors, the dashboard inside the
// app), the main sections with the current one marked, the language
// switcher and an optional slot for page actions (log in / sign out).
//
// The switcher is passed in rather than built here so each page keeps the
// variant it already used (login preserves its query string without
// writing the cookie, the dashboard has its own).
export async function SiteHeader({
  locale,
  variant = "public",
  active,
  switcher,
  actions,
  mobileNav = true,
  showNav = true,
}: {
  locale: "ja" | "en" | "tl";
  variant?: "public" | "app";
  active?: SiteSection;
  switcher?: React.ReactNode;
  actions?: React.ReactNode;
  /** Second row of section tabs below the bar on phones. Off where the
   *  page's own first screen matters more (landing, sign-in). */
  mobileNav?: boolean;
  /** Hide the section links entirely — for step-by-step screens
   *  (onboarding, re-consent) where leaving mid-way is not the point. */
  showNav?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const tApp = await getTranslations({ locale, namespace: "app" });
  const tDashboard = await getTranslations({ locale, namespace: "dashboard" });

  const items: Array<{ key: SiteSection; href: string; label: string; icon: LucideIcon }> = [
    ...(variant === "app"
      ? [
          {
            key: "dashboard" as const,
            href: `/${locale}/dashboard`,
            label: t("dashboard"),
            icon: LayoutDashboardIcon,
          },
        ]
      : []),
    { key: "articles", href: `/${locale}/articles`, label: t("articles"), icon: BookOpenIcon },
    {
      key: "restaurants",
      href: `/${locale}/restaurants`,
      label: t("restaurants"),
      icon: UtensilsCrossedIcon,
    },
    { key: "contact", href: `/${locale}/contact`, label: t("contact"), icon: MailIcon },
  ];

  const homeHref = variant === "app" ? `/${locale}/dashboard` : `/${locale}`;

  return (
    <header className="border-b border-border bg-card">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        {t("skipToContent")}
      </a>
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-3 px-4 md:gap-6 md:px-6">
        <Link
          href={homeHref}
          aria-label={variant === "app" ? t("dashboard") : t("homeLabel")}
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-md"
        >
          <BrandMark />
          <span className="flex flex-col leading-tight">
            <span className="text-base font-bold tracking-tight">{tDashboard("headerLogo")}</span>
            <span className="hidden text-xs text-muted-foreground sm:block">
              {tApp("name")}
            </span>
          </span>
        </Link>

        {showNav && (
        <nav aria-label={t("mainLabel")} className="hidden md:block">
          <ul className="flex items-center gap-1">
            {items.map((item) => {
              const isActive = item.key === active;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium transition-colors",
                      isActive
                        ? "text-primary after:absolute after:inset-x-3 after:-bottom-[15px] after:h-[3px] after:rounded-full after:bg-highlight"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-2 md:gap-3">
          {switcher}
          {actions}
        </div>
      </div>

      {showNav && mobileNav && (
        <nav aria-label={t("mainLabel")} className="border-t border-border md:hidden">
          <ul
            className={cn(
              "mx-auto grid max-w-[1120px] px-2",
              items.length === 4 ? "grid-cols-4" : "grid-cols-3",
            )}
          >
            {items.map((item) => {
              const isActive = item.key === active;
              const Icon = item.icon;
              return (
                <li key={item.key} className="min-w-0">
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-center text-xs font-medium break-words",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn("size-5", isActive && "text-primary")}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span className="leading-tight">{item.label}</span>
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 h-[3px] w-6 rounded-full",
                        isActive ? "bg-highlight" : "bg-transparent",
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
