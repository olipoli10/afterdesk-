import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/site";
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
  /**
   * The default title is the HOMEPAGE title, and it leads with the category
   * nouns a buyer types — "outsource admin tasks", "data entry", "virtual
   * assistant" — rather than with the brand, which nobody searches yet. The
   * promise still closes the line; the brand rides the template on every
   * other page.
   */
  title: {
    default: "Outsource admin, data & research tasks: done overnight at one fixed price",
    template: "%s · AfterDesk",
  },
  /**
   * Leads with the pain the buyer types — checking the work, fixing
   * mistakes, chasing hours — which is the hero subtitle's own register,
   * then the mechanism. "Virtual assistant service without the hiring"
   * stays: it is the one head-term qualifier this site can honestly own.
   */
  description:
    "Stop checking the work, fixing mistakes and chasing hours. Describe any admin, data, research or writing task, approve one fixed price, and get it back by morning — reviewed by an operator first. A virtual assistant service without the hiring. No subscription, no hourly meter.",
  openGraph: {
    siteName: "AfterDesk",
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

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  /** The @modal parallel slot — empty (src/app/@modal/default.tsx) on every
   *  route except a soft navigation to /login, which renders the login
   *  window over whatever `children` already is. */
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {modal}
      </body>
    </html>
  );
}
