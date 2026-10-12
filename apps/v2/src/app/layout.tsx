import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Philippine Community",
  description: "Life support for Filipinos in Japan",
};

// viewport-fit=cover exposes env(safe-area-inset-*) so the chat composer can
// sit above the iPhone home indicator instead of underneath it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf8f2",
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
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
