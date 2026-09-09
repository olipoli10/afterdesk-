import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/site";
import { siteLangOf } from "@/lib/i18n/langs";
import "./globals.css";

// These assets ship with the pinned Next package: no build-time Google request.
const geistSans = localFont({
  src: "../../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "../../node_modules/next/dist/next-devtools/server/font/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ENDVERA — AI operating assistant for construction and managed work",
    template: "%s · Endvera",
  },
  description:
    "ENDVERA TextAssist helps small contractors manage job context, contacts, calendar, follow-ups and prepared communications, with human-backed managed work when judgment is needed.",
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
