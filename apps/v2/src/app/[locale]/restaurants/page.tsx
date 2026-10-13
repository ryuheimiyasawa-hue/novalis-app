import Link from "next/link";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPrefectureLabel } from "@/lib/i18n/prefectures";
import { getCuisineLabel } from "@/lib/i18n/cuisines";
import { pickRestaurantCity, pickRestaurantName } from "@/lib/restaurants/localize";
import {
  MapPinIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { HomeLink } from "@/components/layout/home-link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

// Public Filipino-restaurant catalog (P2-J). Operator-curated, no user
// submissions. ISR-cached 10 min. prefecture / cuisine filters are URL-driven
// (?prefecture=JP-13&cuisine=Filipino); dropdown controls land with the admin
// UI. Mirrors the articles list page.

export const revalidate = 600;

type Locale = "ja" | "en" | "tl";

interface RestaurantRow {
  id: string;
  name: string;
  name_en: string | null;
  prefecture_code: string;
  city_name: string;
  city_name_en: string | null;
  cuisine_type: string | null;
  photo_url: string | null;
  description_ja: string | null;
  description_en: string | null;
  description_tl: string | null;
}

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ prefecture?: string; cuisine?: string }>;
}

function pickDescription(r: RestaurantRow, locale: Locale): string | null {
  if (locale === "en") return r.description_en ?? r.description_ja;
  if (locale === "tl") return r.description_tl ?? r.description_ja;
  return r.description_ja;
}

export default async function RestaurantsListPage({
  params,
  searchParams,
}: PageProps) {
  const { locale } = await params;
  const { prefecture, cuisine } = await searchParams;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as Locale;
  setRequestLocale(safeLocale);

  const admin = getAdminClient();
  let query = admin
    .from("restaurants")
    .select(
      "id, name, name_en, prefecture_code, city_name, city_name_en, cuisine_type, photo_url, description_ja, description_en, description_tl",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (prefecture) query = query.eq("prefecture_code", prefecture);
  if (cuisine) query = query.eq("cuisine_type", cuisine);

  const { data, error } = await query;

  const t = await getTranslations({
    locale: safeLocale,
    namespace: "restaurantsList",
  });
  const tCommon = await getTranslations({
    locale: safeLocale,
    namespace: "common",
  });

  if (error) {
    console.error("[restaurants list] fetch failed:", error.message);
    return (
      <main id="main-content" className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-10 md:px-6 md:py-16">
        <HomeLink locale={safeLocale} className="mb-8" />
        <PageHeader icon={UtensilsCrossedIcon} title={t("title")} description={t("subtitle")} />
        <EmptyState
          role="alert"
          icon={TriangleAlertIcon}
          tone="caution"
          title={t("loadError")}
          action={
            <Button asChild variant="outline">
              <Link href={`/${safeLocale}/restaurants`}>
                <RefreshCwIcon aria-hidden />
                {tCommon("reload")}
              </Link>
            </Button>
          }
        />
      </main>
    );
  }

  const rows = (data ?? []) as RestaurantRow[];

  return (
    <main id="main-content" className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-10 md:px-6 md:py-16">
      <HomeLink locale={safeLocale} className="mb-8" />
      <PageHeader icon={UtensilsCrossedIcon} title={t("title")} description={t("subtitle")} />

      {rows.length === 0 ? (
        <EmptyState
          role="status"
          icon={UtensilsCrossedIcon}
          tone="highlight"
          title={t("empty")}
          action={<HomeLink locale={safeLocale} />}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const pref = getPrefectureLabel(row.prefecture_code, safeLocale);
            const desc = pickDescription(row, safeLocale);
            return (
              <li key={row.id}>
                <Link
                  href={`/${safeLocale}/restaurants/${row.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card transition-colors hover:border-primary/40"
                >
                  {row.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.photo_url}
                      alt={pickRestaurantName(row, safeLocale)}
                      loading="lazy"
                      className="aspect-[16/10] w-full object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="flex aspect-[16/10] w-full items-center justify-center bg-highlight-soft text-highlight-soft-foreground"
                    >
                      <UtensilsCrossedIcon className="size-10" strokeWidth={1.75} />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    {row.cuisine_type && (
                      <span className="w-fit rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">
                        {getCuisineLabel(row.cuisine_type, safeLocale)}
                      </span>
                    )}
                    <h2 className="text-xl font-bold group-hover:text-primary">
                      {pickRestaurantName(row, safeLocale)}
                    </h2>
                    <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPinIcon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      {[pref, pickRestaurantCity(row, safeLocale)].filter(Boolean).join(" ")}
                    </p>
                    {desc && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {desc}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
