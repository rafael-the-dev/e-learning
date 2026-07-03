import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Racio — Gestão Escolar",
    template: "%s — Racio",
  },
  description:
    "Plataforma de gestão para escolas de condução e centros de formação.",
  applicationName: "Racio",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/images/favicon/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/images/favicon/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/images/favicon/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/images/favicon/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/images/favicon/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/images/favicon/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-PT"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
