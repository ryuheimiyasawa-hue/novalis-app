import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPrefectureLabel } from "@/lib/i18n/prefectures";

export const revalidate = 600;

type Locale = "ja" | "en" | "tl";

interface RestaurantDetail {
  id: string;
  name: string;
  prefecture_code: string;
  city_name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  cuisine_type: string | null;
  hours: string | null;
  photo_url: string | null;
  description_ja: string | null;
  description_en: string | null;
  description_tl: string | null;
  is_active: boolean;
}

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

function pickDescription(r: RestaurantDetail, locale: Locale): string | null {
  if (locale === "en") return r.description_en ?? r.description_ja;
  if (locale === "tl") return r.description_tl ?? r.description_ja;
  return r.description_ja;
}

function mapUrl(r: RestaurantDetail): string | null {
  if (r.lat != null && r.lng != null) {
    return `https://www.google.com/maps?q=${r.lat},${r.lng}`;
  }
  const q = [r.address, r.city_name].filter(Boolean).join(" ");
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RestaurantDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const safeLocale = (
    hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  ) as Locale;
  setRequestLocale(safeLocale);

  if (!UUID_RE.test(id)) notFound();

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("restaurants")
    .select(
      "id, name, prefecture_code, city_name, address, lat, lng, cuisine_type, hours, photo_url, description_ja, description_en, description_tl, is_active",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[restaurant detail] fetch failed:", error.message);
    notFound();
  }
  const r = data as RestaurantDetail | null;
  // Inactive rows are not public even by direct id.
  if (!r || !r.is_active) notFound();

  const t = await getTranslations({
    locale: safeLocale,
    namespace: "restaurantDetail",
  });
  const pref = getPrefectureLabel(r.prefecture_code, safeLocale);
  const desc = pickDescription(r, safeLocale);
  const map = mapUrl(r);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href={`/${safeLocale}/restaurants`}
        className="text-sm text-primary hover:underline"
      >
        ← {t("back")}
      </Link>

      {r.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={r.photo_url}
          alt={r.name}
          className="mt-4 h-56 w-full rounded-md object-cover"
        />
      )}

      <header className="mt-4">
        <div className="flex items-center gap-2">
          {r.cuisine_type && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {r.cuisine_type}
            </span>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{r.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[pref, r.city_name].filter(Boolean).join(" ")}
        </p>
      </header>

      <dl className="mt-6 space-y-3 text-sm">
        {r.address && (
          <div>
            <dt className="font-medium">{t("address")}</dt>
            <dd className="text-muted-foreground">{r.address}</dd>
          </div>
        )}
        {r.hours && (
          <div>
            <dt className="font-medium">{t("hours")}</dt>
            <dd className="whitespace-pre-line text-muted-foreground">
              {r.hours}
            </dd>
          </div>
        )}
      </dl>

      {desc && (
        <section className="mt-6">
          <p className="whitespace-pre-line text-sm leading-relaxed">{desc}</p>
        </section>
      )}

      {map && (
        <div className="mt-6">
          <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            {t("viewOnMap")}
          </a>
        </div>
      )}
    </main>
  );
}
