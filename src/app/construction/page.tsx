import Link from "next/link";
import { cookies } from "next/headers";
import { LangSwitch } from "@/components/lang-switch";
import { Wordmark } from "@/components/logo";
import { CLIENT_LANGS, clientLangOf } from "@/lib/i18n/client";
import { publicConstructionOffer } from "@/lib/construction-operating-assistant-r34/public-offer";
import { TEXTASSIST_PUBLIC_COPY, TEXTASSIST_RELEASE_BOUNDARY } from "@/lib/textassist/public-copy";

export const metadata = { title: "ENDVERA Construction", description: "The local-build Construction Operating Assistant by ENDVERA." };

export default async function ConstructionPublicPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const raw = sp.lang ?? (await cookies()).get("ss-lang-client")?.value;
  const lang = clientLangOf(raw);
  const locale = lang === "fr" ? "fr-CA" as const : "en-CA" as const;
  const offer = publicConstructionOffer(locale);
  const french = locale === "fr-CA";
  const textAssist = TEXTASSIST_PUBLIC_COPY[french ? "fr" : "en"];
  return (
    <main className="min-h-screen bg-[#08090B] text-[#F7F6F3]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <Link href="/" aria-label="Endvera home"><Wordmark tone="paper" plate /></Link>
        <nav className="flex items-center gap-4" aria-label={french ? "Navigation Construction" : "Construction navigation"}>
          <Link href="/textassist" className="hidden text-sm text-[#D6B878] underline-offset-4 hover:underline sm:inline">TextAssist</Link>
          <LangSwitch path="/construction" current={lang} options={CLIENT_LANGS} tone="onyx" />
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:pb-24 sm:pt-24">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#D6B878]">{french ? "ENDVERA · ASSISTANT D’OPÉRATIONS CONSTRUCTION" : "ENDVERA · CONSTRUCTION OPERATING ASSISTANT"}</p>
        <h1 className="mt-5 max-w-5xl text-4xl font-semibold tracking-[-0.05em] sm:text-7xl">{offer.headline}</h1>
        <p className="mt-7 max-w-3xl text-lg leading-8 text-[#A1A8B3] sm:text-xl">{offer.promise}</p>
        <div className="mt-9 flex flex-wrap gap-4">
          <Link href="/register" className="rounded-full bg-[#D6B878] px-6 py-3 font-semibold text-[#14161A] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F7F6F3]">{french ? "Créer un compte local" : "Create a local account"}</Link>
          <Link href="/textassist" className="rounded-full border border-[#D6B878]/60 px-6 py-3 font-semibold text-[#E2C486] no-underline">{french ? "Voir l’assistant texte" : "See the text assistant"}</Link>
        </div>
        <div className="mt-8 rounded-xl border border-[#D6B878]/35 bg-[#D6B878]/[0.06] p-4 text-sm leading-6">
          <strong>{french ? "État honnête :" : "Honest status:"}</strong> {offer.unavailable[0]} {french ? "Les connecteurs réels et le prix ne sont pas encore validés." : "Live connectors and pricing are not yet validated."}
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02] px-5 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#D6B878]">{french ? "DANS UNE JOURNÉE RÉELLE" : "IN A REAL WORKDAY"}</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">{textAssist.outcomesTitle}</h2>
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-2">
            {textAssist.outcomes.map((outcome) => <article key={outcome.title} className="bg-[#0D0F13] p-7"><h3 className="text-xl font-semibold">{outcome.title}</h3><p className="mt-3 leading-7 text-[#A1A8B3]">{outcome.body}</p></article>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <h2 className="text-3xl font-semibold tracking-[-0.03em]">{textAssist.stepsTitle}</h2>
        <ol className="mt-8 grid gap-4 lg:grid-cols-5">
          {textAssist.steps.map((step) => <li key={step.title} className="rounded-2xl border border-white/10 bg-[#111318] p-6"><h3 className="text-lg font-semibold text-[#E2C486]">{step.title}</h3><p className="mt-3 text-sm leading-6 text-[#A1A8B3]">{step.body}</p></li>)}
        </ol>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02] px-5 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">{french ? "Ce qui existe déjà dans le produit local" : "What already exists in the local product"}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">{offer.capabilities.map((capability) => <article key={capability.code} className="rounded-2xl border border-white/10 bg-[#111318] p-6"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#D6B878]">{french ? "Disponible localement" : "Available locally"}</p><h3 className="mt-3 text-xl font-semibold">{capability.title}</h3><p className="mt-2 leading-7 text-[#A1A8B3]">{capability.body}</p></article>)}</div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-16 sm:py-24 lg:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-[#0D0F13] p-8"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#D6B878]">{french ? "APPUI HUMAIN" : "HUMAN BACKUP"}</p><h2 className="mt-3 text-3xl font-semibold">{textAssist.humanBackupTitle}</h2><p className="mt-4 leading-7 text-[#A1A8B3]">{textAssist.humanBackupBody}</p></article>
        <article className="rounded-2xl border border-[#D6B878]/35 bg-[#D6B878]/[0.06] p-8"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#D6B878]">{french ? "TU GARDES LE CONTRÔLE" : "YOU KEEP CONTROL"}</p><h2 className="mt-3 text-3xl font-semibold">{textAssist.trustTitle}</h2><p className="mt-4 leading-7 text-[#A1A8B3]">{textAssist.trustBody}</p></article>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="rounded-2xl border border-white/10 bg-[#111318] p-8 sm:flex sm:items-center sm:justify-between sm:gap-8"><div><h2 className="text-3xl font-semibold">{french ? "Essaie le loop local." : "Try the local loop."}</h2><p className="mt-3 max-w-2xl leading-7 text-[#A1A8B3]">{french ? "Aucun vrai texto, appel ou connecteur externe ne part de cette version." : "No live text, call or external connector leaves this version."}</p></div><Link href="/register" className="mt-6 inline-flex shrink-0 rounded-full bg-[#D6B878] px-6 py-3 font-semibold text-[#14161A] no-underline sm:mt-0">{french ? "Commencer localement" : "Start locally"}</Link></div>
        <nav aria-label={french ? "Liens de confiance" : "Trust links"} className="mt-8 flex flex-wrap gap-5 text-sm text-[#A1A8B3]"><Link href="/privacy" className="underline underline-offset-4">{french ? "Confidentialité" : "Privacy"}</Link><Link href="/account-deletion" className="underline underline-offset-4">{french ? "Suppression de compte" : "Account deletion"}</Link><Link href="/construction/support" className="underline underline-offset-4">{french ? "Soutien" : "Support"}</Link><Link href="/" className="underline underline-offset-4">{french ? "Tout ENDVERA" : "All of ENDVERA"}</Link></nav>
        <p className="mt-6 font-mono text-[10px] text-[#78808B]">providerObserved={String(TEXTASSIST_RELEASE_BOUNDARY.providerObserved)} · pricingValidated={String(TEXTASSIST_RELEASE_BOUNDARY.pricingValidated)} · published={String(TEXTASSIST_RELEASE_BOUNDARY.published)}</p>
      </section>
    </main>
  );
}
