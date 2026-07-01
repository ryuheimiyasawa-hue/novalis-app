import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPrefectureLabel } from "@/lib/i18n/prefectures";

// ISR: the restaurant strip reads the DB, so cache the page for 10 min rather
// than hitting Supabase on every landing visit.
export const revalidate = 600;

type Locale = "ja" | "en" | "tl";

interface RestaurantCard {
  id: string;
  name: string;
  prefecture_code: string;
  city_name: string;
  cuisine_type: string | null;
  photo_url: string | null;
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as Locale;
  setRequestLocale(safeLocale);
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");

  // Best-effort: the strip is hidden if the DB is unreachable. This also keeps
  // the build green where Supabase env is absent (local / CI prerender); on
  // Vercel the env is present at build so the strip prerenders with data.
  let restaurants: RestaurantCard[] = [];
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from("restaurants")
      .select("id, name, prefecture_code, city_name, cuisine_type, photo_url")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(4);
    restaurants = (data ?? []) as RestaurantCard[];
  } catch (err) {
    console.warn(
      "[landing] restaurants strip skipped:",
      err instanceof Error ? err.message : String(err),
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center gap-16 px-6 py-16">
      <section className="max-w-2xl space-y-6 pt-8 text-center">
        <p className="text-sm uppercase tracking-widest text-neutral-500">
          {tApp("name")}
        </p>
        <h1 className="text-4xl font-bold leading-tight md:text-5xl">
          {t("title")}
        </h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-300">
          {t("subtitle")}
        </p>
        <div className="flex justify-center gap-3 pt-4">
          <Link
            href={`/${safeLocale}/login`}
            className="rounded-md bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
          >
            {t("ctaPrimary")}
          </Link>
          <Link
            href={`/${safeLocale}/legal/terms`}
            className="rounded-md border border-neutral-300 px-6 py-3 font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            {t("ctaSecondary")}
          </Link>
        </div>
      </section>

      {restaurants.length > 0 && (
        <section className="w-full max-w-4xl">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-bold">{t("restaurantsHeading")}</h2>
            <Link
              href={`/${safeLocale}/restaurants`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              {t("restaurantsViewAll")} →
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {restaurants.map((r) => {
              const pref = getPrefectureLabel(r.prefecture_code, safeLocale);
              return (
                <li key={r.id}>
                  <Link
                    href={`/${safeLocale}/restaurants/${r.id}`}
                    className="block h-full overflow-hidden rounded-md border border-neutral-200 bg-white hover:border-blue-300 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    {r.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.photo_url}
                        alt={r.name}
                        loading="lazy"
                        className="h-24 w-full object-cover"
                      />
                    ) : (
                      <div className="h-24 w-full bg-neutral-100 dark:bg-neutral-800" />
                    )}
                    <div className="space-y-0.5 px-2 py-2">
                      <p className="line-clamp-1 text-sm font-medium">
                        {r.name}
                      </p>
                      <p className="line-clamp-1 text-xs text-neutral-500">
                        {[r.cuisine_type, pref].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
