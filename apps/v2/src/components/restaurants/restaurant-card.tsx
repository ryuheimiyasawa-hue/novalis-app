import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, MapPinIcon, UtensilsCrossedIcon } from "lucide-react";

// When In Manila style place card: a 16:9 photo with a solid blue type tag
// (Restaurant / Grocery) on its corner, then the bold name, the area with a
// map pin, two lines of description and a "view" cue. Without a photo the
// frame shows a soft-yellow tile with a utensils icon so the card never
// looks broken. Shared by the landing strip and the restaurants page.
export function RestaurantCard({
  href,
  name,
  area,
  description,
  photoUrl,
  kindLabel,
  viewLabel,
  priority = false,
}: {
  href: string;
  name: string;
  area: string;
  description: string | null;
  photoUrl: string | null;
  kindLabel: string;
  viewLabel: string;
  priority?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-colors hover:border-primary/40"
    >
      <span className="relative block aspect-video w-full overflow-hidden bg-highlight-soft">
        {photoUrl ? (
          // Photos come from operator-entered URLs on any host, so they are
          // served as-is (unoptimized) rather than through the image proxy.
          <Image
            src={photoUrl}
            alt={name}
            fill
            unoptimized
            loading={priority ? "eager" : "lazy"}
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 85vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-full items-center justify-center text-highlight-soft-foreground"
          >
            <UtensilsCrossedIcon className="size-10" strokeWidth={1.75} />
          </span>
        )}
        <span className="absolute top-3 left-3 rounded-full bg-primary px-2.5 py-1 font-display text-xs font-extrabold text-primary-foreground">
          {kindLabel}
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-4 md:p-5">
        <span className="line-clamp-2 font-display text-lg leading-snug font-extrabold text-foreground group-hover:text-primary">
          {name}
        </span>
        {area && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <MapPinIcon className="size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
            <span className="truncate">{area}</span>
          </span>
        )}
        {description && (
          <span className="line-clamp-2 text-sm text-muted-foreground">{description}</span>
        )}
        <span className="mt-auto inline-flex items-center gap-1 pt-2 font-display text-sm font-bold text-primary">
          {viewLabel}
          <ArrowRightIcon
            className="size-4 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2}
            aria-hidden
          />
        </span>
      </span>
    </Link>
  );
}

/** Grocery stores are entered with the cuisine "食材店"; everything else is
 *  shown as a restaurant. */
export function restaurantKind(cuisine: string | null): "grocery" | "restaurant" {
  return cuisine?.trim() === "食材店" ? "grocery" : "restaurant";
}
