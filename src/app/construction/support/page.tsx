import Link from "next/link";
import { cookies } from "next/headers";
import { LangSwitch } from "@/components/lang-switch";
import { Wordmark } from "@/components/logo";
import { CLIENT_LANGS, clientLangOf } from "@/lib/i18n/client";
import { RELEASE_BOUNDARY, RELEASE_PUBLIC_PATHS } from "@/lib/construction-operating-assistant-r35/registry";

export const metadata = { title: "ENDVERA Construction Support", description: "Current support and availability status for the local ENDVERA Construction build." };

export default async function ConstructionSupportPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const lang = clientLangOf(sp.lang ?? (await cookies()).get("ss-lang-client")?.value);
  const french = lang === "fr";
  return <main className="min-h-screen bg-[#08090B] text-[#F7F6F3]">
    <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-6"><Link href="/construction" aria-label="ENDVERA Construction"><Wordmark tone="paper" plate /></Link><LangSwitch path="/construction/support" current={lang} options={CLIENT_LANGS} tone="onyx" /></header>
    <section className="mx-auto max-w-4xl px-5 pb-20 pt-14"><p className="font-mono text-xs uppercase tracking-[0.18em] text-[#D6B878]">{french ? "Appui · état actuel" : "Support · current status"}</p><h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{french ? "Le produit est encore local." : "The product is still local."}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[#A1A8B3]">{french ? "L’appui humain existe dans le workflow local pour les exceptions bornées. Aucun canal de soutien client externe ou service de production n’est encore annoncé." : "Human support exists inside the local workflow for bounded exceptions. No external customer-support channel or production service is announced yet."}</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2"><article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"><h2 className="text-xl font-semibold">{french ? "Disponible" : "Available"}</h2><p className="mt-3 text-[#A1A8B3]">{french ? "Inspection locale, état canonique et acheminement humain préparé." : "Local inspection, canonical state and prepared human routing."}</p></article><article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"><h2 className="text-xl font-semibold">{french ? "Non disponible" : "Unavailable"}</h2><p className="mt-3 text-[#A1A8B3]">{french ? "Application publiée, fournisseurs réels, paiement et soutien de production." : "Published app, live providers, billing and production support."}</p></article></div>
      <div className="mt-10 rounded-xl border border-[#D6B878]/35 p-5 text-sm"><strong>{french ? "Frontière vérifiée :" : "Verified boundary:"}</strong> signed={String(RELEASE_BOUNDARY.signed)}, uploaded={String(RELEASE_BOUNDARY.uploaded)}, published={String(RELEASE_BOUNDARY.published)}, deployed={String(RELEASE_BOUNDARY.deployed)}.</div>
      <nav aria-label={french ? "Politiques" : "Policies"} className="mt-10 flex flex-wrap gap-5 text-sm"><Link className="underline underline-offset-4" href={RELEASE_PUBLIC_PATHS.privacy}>{french ? "Confidentialité" : "Privacy"}</Link><Link className="underline underline-offset-4" href={RELEASE_PUBLIC_PATHS.security}>{french ? "Sécurité" : "Security"}</Link><Link className="underline underline-offset-4" href="/construction">{french ? "Retour à Construction" : "Back to Construction"}</Link></nav>
    </section>
  </main>;
}
