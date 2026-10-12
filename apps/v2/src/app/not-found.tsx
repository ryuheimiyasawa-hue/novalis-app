import Link from "next/link";

// Fallback for URLs that match no route at all (for example /ja/unknown).
// It renders inside the bare root layout, before any locale is known, so it
// stays trilingual and static: the brand, one sentence in each language and
// a way home in each language. Colours come from the brand tokens.
const HOMES = [
  { href: "/ja", label: "ホームへ戻る", lang: "ja" },
  { href: "/en", label: "Back to home", lang: "en" },
  { href: "/tl", label: "Bumalik sa home", lang: "tl" },
] as const;

export default function RootNotFound() {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-16"
    >
      <div className="w-full max-w-[560px] rounded-lg border border-border bg-card p-6 text-center shadow-card md:p-10">
        <span
          aria-hidden
          className="relative mx-auto inline-flex size-12 items-center justify-center rounded-md bg-primary text-xl leading-none font-bold text-primary-foreground"
        >
          N
          <span className="absolute bottom-2 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-highlight" />
        </span>
        <h1 className="mt-6 text-xl font-bold">
          お探しのページが見つかりませんでした
        </h1>
        <p lang="en" className="mt-2 text-base text-muted-foreground">
          We could not find this page.
        </p>
        <p lang="tl" className="text-base text-muted-foreground">
          Hindi namin mahanap ang pahinang ito.
        </p>
        <ul className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {HOMES.map((h, i) => (
            <li key={h.href}>
              <Link
                href={h.href}
                lang={h.lang}
                className={
                  i === 0
                    ? "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                    : "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-input bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                }
              >
                {h.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
