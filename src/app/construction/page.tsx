import Link from "next/link";
import { cookies } from "next/headers";
import { LangSwitch } from "@/components/lang-switch";
import { Wordmark } from "@/components/logo";
import { CLIENT_LANGS, clientLangOf } from "@/lib/i18n/client";
import { publicConstructionOffer } from "@/lib/construction-operating-assistant-r34/public-offer";

export const metadata = { title: "ENDVERA Construction", description: "The local-build Construction Operating Assistant by ENDVERA." };

export default async function ConstructionPublicPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const raw = sp.lang ?? (await cookies()).get("ss-lang-client")?.value;
  const lang = clientLangOf(raw);
  const locale = lang === "fr" ? "fr-CA" as const : "en-CA" as const;
  const offer = publicConstructionOffer(locale);
  const french = locale === "fr-CA";
  return <main className="min-h-screen bg-[#08090B] text-[#F7F6F3]">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6"><Link href="/" aria-label="Endvera home"><Wordmark tone="paper" plate /></Link><LangSwitch path="/construction" current={lang} options={CLIENT_LANGS} tone="onyx" /></header>
    <section className="mx-auto max-w-6xl px-5 pb-20 pt-14 sm:pt-24"><p className="font-mono text-xs uppercase tracking-[0.18em] text-[#D6B878]">{french ? "Construction · développement local" : "Construction · local build"}</p><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{offer.headline}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[#A1A8B3]">{offer.promise}</p><div className="mt-8 rounded-xl border border-[#D6B878]/35 bg-[#D6B878]/[0.06] p-4 text-sm"><strong>{french ? "État honnête :" : "Honest status:"}</strong> {offer.unavailable[0]} {french ? "Le prix n’est pas encore établi." : "Pricing is not set yet."}</div>
      <div className="mt-12 grid gap-4 md:grid-cols-2">{offer.capabilities.map((capability) => <article key={capability.code} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#D6B878]">{french ? "Disponible localement" : "Available locally"}</p><h2 className="mt-3 text-xl font-semibold">{capability.title}</h2><p className="mt-2 leading-7 text-[#A1A8B3]">{capability.body}</p></article>)}</div>
      <div className="mt-12 flex flex-wrap items-center gap-4"><Link href="/register" className="rounded-full border border-[#D6B878] px-6 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F7F6F3]">{french ? "Créer un compte local" : "Create a local account"}</Link><Link href="/" className="text-sm text-[#A1A8B3] underline underline-offset-4">{french ? "Retour à ENDVERA" : "Back to ENDVERA"}</Link></div>
    </section>
  </main>;
}
