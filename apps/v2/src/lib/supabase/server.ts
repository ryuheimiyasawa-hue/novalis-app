import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getCookieDomain(): string | undefined {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" ? undefined : host;
  } catch {
    return undefined;
  }
}

export async function createClient() {
  const cookieStore = await cookies();
  const cookieDomain = getCookieDomain();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: cookieDomain
        ? { domain: cookieDomain, sameSite: "lax", secure: true, httpOnly: true }
        : { sameSite: "lax", httpOnly: true },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies; the proxy/middleware will refresh on next request
          }
        },
      },
    },
  );
}
