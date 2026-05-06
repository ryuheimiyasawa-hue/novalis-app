import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Philippine Community",
  description: "Life support for Filipinos in Japan",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
