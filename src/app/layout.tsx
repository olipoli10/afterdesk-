import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/site";
import { siteLangOf } from "@/lib/i18n/langs";
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
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Managed back-office execution for data, research and CRM work",
    template: "%s · Endvera",
  },
  description:
    "Endvera scopes, manages and reviews bounded CRM, research, data and document work. Approve the scope and price, then receive a checked, usable deliverable.",
  openGraph: {
    siteName: "Endvera",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0B0D",
};

export default async function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  /** The @modal parallel slot — empty (src/app/@modal/default.tsx) on every
   *  route except a soft navigation to /login, which renders the login
   *  window over whatever `children` already is. */
  modal: React.ReactNode;
}>) {
  const lang = siteLangOf((await headers()).get("x-site-lang"));

  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {modal}
      </body>
    </html>
  );
}
