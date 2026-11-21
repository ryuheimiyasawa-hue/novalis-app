import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

// Display face for headings, buttons, chips and the MORITA wordmark only.
// Self-hosted by next/font (no request to Google from the browser); body
// copy stays on system fonts to keep the page light on mobile data.
const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  weight: ["700", "800"],
  display: "swap",
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "MORITA | Philippine Community",
  description: "Life support for Filipinos in Japan",
};

// viewport-fit=cover exposes env(safe-area-inset-*) so the chat composer can
// sit above the iPhone home indicator instead of underneath it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    // Matches the solid brand-blue header (--primary / dark --background).
    { media: "(prefers-color-scheme: light)", color: "#0a4fb8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1726" },
  ],
};

// Next.js 16 requires <html> and <body> to live in the root layout.
// The lang attribute is set to the default locale here; the locale
// layout no longer renders its own <html>/<body>.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={nunito.variable}>
      <body>{children}</body>
    </html>
  );
}
