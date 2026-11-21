import Link from "next/link";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPrefectureLabel } from "@/lib/i18n/prefectures";
import { pickRestaurantCity, pickRestaurantName } from "@/lib/restaurants/localize";
import {
  RefreshCwIcon,
  TriangleAlertIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { HomeLink } from "@/components/layout/home-link";
import { PageBand } from "@/components/layout/page-band";
import { RestaurantCard, restaurantKind } from "@/components/restaurants/restaurant-card";
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
      <main id="main-content" className="w-full flex-1">
        <PageBand
          icon={UtensilsCrossedIcon}
          kicker={t("kicker")}
          title={t("title")}
          description={t("subtitle")}
          top={<HomeLink locale={safeLocale} tone="brand" />}
        />
        <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6 md:py-12">
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
        </div>
      </main>
    );
  }

  const rows = (data ?? []) as RestaurantRow[];

  return (
    <main id="main-content" className="w-full flex-1">
      <PageBand
        icon={UtensilsCrossedIcon}
        kicker={t("kicker")}
        title={t("title")}
        description={t("subtitle")}
        top={<HomeLink locale={safeLocale} tone="brand" />}
      />
      <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6 md:py-12">
        {rows.length === 0 ? (
          <EmptyState
            role="status"
            icon={UtensilsCrossedIcon}
            tone="highlight"
            title={t("empty")}
            action={<HomeLink locale={safeLocale} />}
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row, i) => (
              <li key={row.id}>
                <RestaurantCard
                  href={`/${safeLocale}/restaurants/${row.id}`}
                  name={pickRestaurantName(row, safeLocale)}
                  area={[
                    getPrefectureLabel(row.prefecture_code, safeLocale),
                    pickRestaurantCity(row, safeLocale),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  description={pickDescription(row, safeLocale)}
                  photoUrl={row.photo_url}
                  kindLabel={t(`kind.${restaurantKind(row.cuisine_type)}`)}
                  viewLabel={t("view")}
                  priority={i < 3}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
