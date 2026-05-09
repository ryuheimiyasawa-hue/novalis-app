import { redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/lib/i18n/routing";
import { requireAuth } from "@/lib/auth/require-auth";
import { AuthError } from "@/lib/auth/errors";

export default async function AuthedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  try {
    await requireAuth();
  } catch (err) {
    if (err instanceof AuthError && err.code === "UNAUTHORIZED") {
      redirect(`/${safeLocale}/login`);
    }
    throw err;
  }
  return <>{children}</>;
}
