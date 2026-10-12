import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPrefectureLabel } from "@/lib/i18n/prefectures";
import { getCuisineLabel } from "@/lib/i18n/cuisines";
import {
  ArrowLeftIcon,
  ClockIcon,
  ExternalLinkIcon,
  MapPinIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { HomeLink } from "@/components/layout/home-link";
import { IconTile } from "@/components/layout/icon-tile";
import { Button } from "@/components/ui/button";

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
    <main id="main-content" className="mx-auto w-full max-w-[728px] flex-1 px-4 py-10 md:px-6 md:py-16">
      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2">
        <HomeLink locale={safeLocale} />
        <Link
          href={`/${safeLocale}/restaurants`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline lg:min-h-9"
        >
          <ArrowLeftIcon className="size-4" strokeWidth={1.75} aria-hidden />
          {t("back")}
        </Link>
      </div>

      {r.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={r.photo_url}
          alt={r.name}
          className="aspect-[16/9] w-full rounded-lg border border-border object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="flex aspect-[16/7] w-full items-center justify-center rounded-lg bg-highlight-soft text-highlight-soft-foreground"
        >
          <UtensilsCrossedIcon className="size-12" strokeWidth={1.75} />
        </div>
      )}

      <header className="mt-8 space-y-3">
        {r.cuisine_type && (
          <span className="inline-flex rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">
            {getCuisineLabel(r.cuisine_type, safeLocale)}
          </span>
        )}
        <h1 className="text-2xl font-bold md:text-3xl">{r.name}</h1>
        <p className="inline-flex items-center gap-1.5 text-base text-muted-foreground">
          <MapPinIcon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {[pref, r.city_name].filter(Boolean).join(" ")}
        </p>
      </header>

      {(r.address || r.hours) && (
        <dl className="mt-8 grid gap-4 rounded-lg border border-border bg-card p-5 shadow-card sm:grid-cols-2 md:p-6">
          {r.address && (
            <div className="flex gap-3">
              <IconTile icon={MapPinIcon} size="sm" />
              <div>
                <dt className="text-sm font-bold">{t("address")}</dt>
                <dd className="text-sm text-muted-foreground">{r.address}</dd>
              </div>
            </div>
          )}
          {r.hours && (
            <div className="flex gap-3">
              <IconTile icon={ClockIcon} size="sm" />
              <div>
                <dt className="text-sm font-bold">{t("hours")}</dt>
                <dd className="whitespace-pre-line text-sm text-muted-foreground">
                  {r.hours}
                </dd>
              </div>
            </div>
          )}
        </dl>
      )}

      {desc && (
        <section className="mt-8">
          <p className="max-w-[680px] whitespace-pre-line text-base">{desc}</p>
        </section>
      )}

      {map && (
        <div className="mt-8">
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <a
              href={map}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPinIcon aria-hidden />
              {t("viewOnMap")}
              <ExternalLinkIcon aria-hidden />
            </a>
          </Button>
        </div>
      )}
    </main>
  );
}
