import Link from "next/link";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPrefectureLabel } from "@/lib/i18n/prefectures";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";

// Public Filipino-restaurant catalog (P2-J). Operator-curated, no user
// submissions. ISR-cached 10 min. prefecture / cuisine filters are URL-driven
// (?prefecture=JP-13&cuisine=Filipino); dropdown controls land with the admin
// UI. Mirrors the articles list page.

export const revalidate = 600;

type Locale = "ja" | "en" | "tl";

interface RestaurantRow {
  id: string;
  name: string;
  prefecture_code: string;
  city_name: string;
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
      "id, name, prefecture_code, city_name, cuisine_type, photo_url, description_ja, description_en, description_tl",
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
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-4 text-sm text-destructive">{t("loadError")}</p>
      </div>
    );
  }

  const rows = (data ?? []) as RestaurantRow[];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-3 flex justify-end">
        <LocaleSwitcher currentLocale={safeLocale} label={tCommon("language")} />
      </div>
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {rows.map((row) => {
            const pref = getPrefectureLabel(row.prefecture_code, safeLocale);
            const desc = pickDescription(row, safeLocale);
            return (
              <li key={row.id}>
                <Link
                  href={`/${safeLocale}/restaurants/${row.id}`}
                  className="block h-full overflow-hidden rounded-md border border-border bg-card hover:border-primary/40 hover:bg-accent/30"
                >
                  {row.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.photo_url}
                      alt={row.name}
                      loading="lazy"
                      className="h-40 w-full object-cover"
                    />
                  )}
                  <div className="space-y-1 px-4 py-3">
                    <div className="flex items-center gap-2">
                      {row.cuisine_type && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {row.cuisine_type}
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-semibold leading-snug">
                      {row.name}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {[pref, row.city_name].filter(Boolean).join(" ")}
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
