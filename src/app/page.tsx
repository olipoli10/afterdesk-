import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { arrivedFromInsideTheApp, getSessionUser, roleHome } from "@/lib/authz";
import { SITE_URL } from "@/lib/site";
import { LangSwitch } from "@/components/lang-switch";
import { CLIENT_I18N, CLIENT_LANGS, clientLangOf } from "@/lib/i18n/client";
import { langAlternates, type SiteLang } from "@/lib/i18n/langs";
import {
  CONCEPT_ASSEMBLY_I18N,
  conceptAssemblyLangOf,
  HOME_CONCIERGE_I18N,
} from "@/lib/i18n/home-assembly";
import { Wordmark } from "@/components/logo";
import { AssemblyExperience } from "./_home/assembly-experience";
import { SimplicityActs } from "@/app/_v7/simplicity-acts";
import { V7_ACTS_I18N } from "@/lib/i18n/v7-acts";

function AccentLine({ text, accent }: { text: string; accent: string }) {
  const at = text.indexOf(accent);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-[#D87526]">{accent}</span>
      {text.slice(at + accent.length)}
    </>
  );
}

/* ---------------------------------------------------------------------------
   The homepage opens with the four V7 simplicity acts, proven locally on the
   pre-rebrand lineage and reimplemented here on the official ENDVERA source:
   they tell what the offer is, the problem, the solution and how it works
   before any example. The accepted V5.5 "Assembly Lock" experience
   (Codex GO 9.2/10) then continues the story in continuation mode - its
   internal geometry is untouched, it simply no longer draws its own opening.
   The acts own the single A2 concierge (Phase 1.4B), so the page does not
   mount a second one. One request enters; Endvera assembles
   software, models, connected tools, a browser and bounded human judgment;
   problems are recovered; the result is checked; a finished result leaves.

   Copy lives in src/lib/i18n/home-assembly.ts (EN/FR/ES/TL) and stays
   within ADR-023: Early Access is the global qualifier and recurring work
   is never presented as live. The typed field sends nothing; the real door
   is the /register CTA under it. The concierge is a static site guide:
   approved cited answers, honest unknown, fail-closed unavailable. No
   model, no API, no storage, no cookies of its own.
   ------------------------------------------------------------------------- */

const HOME_META: Record<SiteLang, { title: string; description: string }> = {
  en: {
    title: "One request in. One verified result out. | Endvera",
    description:
      "Describe the result you need. Endvera assembles software, models, connected tools, browser work and bounded human review, then delivers one checked result at an approved fixed price.",
  },
  fr: {
    title: "Une demande entre. Un résultat vérifié ressort. | Endvera",
    description:
      "Décrivez le résultat qu'il vous faut. Endvera assemble logiciels, modèles, outils connectés, travail navigateur et révision humaine bornée, puis livre un résultat vérifié à un prix fixe approuvé.",
  },
  es: {
    title: "Entra una solicitud. Sale un resultado verificado. | Endvera",
    description:
      "Describa el resultado que necesita. Endvera ensambla software, modelos, herramientas conectadas, trabajo de navegador y revisión humana acotada, y entrega un resultado verificado a un precio fijo aprobado.",
  },
  tl: {
    title: "Isang kahilingan ang pumapasok. Isang beripikadong resulta ang lumalabas. | Endvera",
    description:
      "Ilarawan ang resultang kailangan mo. Binubuo ng Endvera ang software, mga modelo, konektadong tools, browser na trabaho at may hangganang pagsusuri ng tao, at naghahatid ng isang siniyasat na resulta sa aprubadong fixed na presyo.",
  },
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = clientLangOf(sp.lang);
  /* HOME_META titles already carry "| Endvera"; absolute keeps the root
     layout's "%s · Endvera" template from adding the brand a second time */
  return {
    ...HOME_META[lang],
    title: { absolute: HOME_META[lang].title },
    alternates: langAlternates("/", sp.lang),
  };
}

const ORG_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "Endvera",
  url: SITE_URL,
  description:
    "Endvera assembles software, models, connected tools, browser work and bounded human review, and delivers one checked result at an approved fixed price. Early Access.",
});

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const user = await getSessionUser();
  /* Same session contract as before the port: a verified session arriving
     cold at the bare root is bounced to its portal; everyone else gets the
     marketing site. */
  if (user?.emailVerified && !(await arrivedFromInsideTheApp())) {
    redirect(roleHome(user.role));
  }
  const portal = user ? (user.emailVerified ? roleHome(user.role) : "/verify-email") : undefined;
  const sp = await searchParams;
  const jar = await cookies();
  const raw = sp.lang ?? jar.get("ss-lang-client")?.value;
  const lang = conceptAssemblyLangOf(raw);
  const nav = CLIENT_I18N[clientLangOf(raw)];
  const t = CONCEPT_ASSEMBLY_I18N[lang];
  const concierge = HOME_CONCIERGE_I18N[lang];
  const acts = V7_ACTS_I18N[clientLangOf(raw)];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ORG_JSONLD }} />

      {/* ONE header for the whole document, and the only wordmark on the
          page: the official ENDVERA lockup component, never a typed name.
          The machine below runs in continuation mode and no longer draws
          its own nav, so this header is the single owner of the identity. */}
      <header data-site-header="" className="absolute inset-x-0 top-0 z-50">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 text-[#F7F6F3] sm:gap-x-5 sm:gap-y-1.5 sm:px-6 sm:pt-9">
          <Link
            data-site-wordmark=""
            href="/"
            aria-label="Endvera home"
            className="text-[.875rem] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C486] sm:text-[1.0625rem]"
          >
            {/* the name-plate lockup: the mark mounted on a machined
                graphite plate that sits on the console's upper rail */}
            <Wordmark tone="paper" plate />
          </Link>
          <span
            /* the element crosses the RSC boundary into the header's child
               list, so React demands an explicit key for it */
            key="page-utilities"
            className="order-3 flex basis-full items-center gap-4 font-mono text-[11px] uppercase tracking-[0.16em] text-[#8a919e] md:order-none md:basis-auto"
          >
            {portal ? (
              <Link href={portal} className="transition-colors hover:text-[#c9a76a]">
                {nav.nav.portal}
              </Link>
            ) : (
              <Link href="/login" className="transition-colors hover:text-[#c9a76a]">
                {nav.nav.signIn}
              </Link>
            )}
            <LangSwitch path="/" current={lang} options={CLIENT_LANGS} tone="onyx" />
          </span>
          <span className="ml-auto flex items-center gap-8">
            <a href="#outcomes" className="hidden text-[0.875rem] text-[#9AA1AB] no-underline transition-colors hover:text-[#F7F6F3] md:inline">{t.nav.outcomes}</a>
            <a href="#how" className="hidden text-[0.875rem] text-[#9AA1AB] no-underline transition-colors hover:text-[#F7F6F3] md:inline">{t.nav.how}</a>
            <a href="#inside" className="hidden text-[0.875rem] text-[#9AA1AB] no-underline transition-colors hover:text-[#F7F6F3] md:inline">{t.nav.inside}</a>
            <span data-early-access="" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#262B35] bg-[#0F1116] px-2 py-1 font-mono text-[.625rem] uppercase tracking-[0.05em] text-[#8a919e] sm:gap-[0.4375rem] sm:px-3 sm:py-1.5 sm:text-[0.71875rem] sm:tracking-[0.06em]">
              <span aria-hidden className="h-1 w-1 rounded-full bg-[#C9A76A]" />
              {t.nav.earlyAccess}
            </span>
          </span>
        </div>
      </header>

      <main>
        {/* The narrative stays in normal document flow and owns the single
            A2 being. A2 appears at three explanatory stops; the accepted
            machine then demonstrates one workflow without a second guide. */}
        <SimplicityActs copy={acts} concierge={concierge}>
          {/* Keeping the accepted machine inside the narration owner preserves
              one continuous reading flow and the single-being invariant. */}
          <div
            data-v7-sem="example"
            data-a2-guide="example"
            className="relative bg-[#08090B]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(154,161,171,0.055) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, rgba(154,161,171,0.055) 0 1px, transparent 1px 32px), repeating-linear-gradient(0deg, rgba(154,161,171,0.06) 0 1px, transparent 1px 160px), repeating-linear-gradient(90deg, rgba(154,161,171,0.06) 0 1px, transparent 1px 160px)",
            }}
          >
            {/* The accepted machine starts immediately: it demonstrates one
                real request end to end, then its own illustrated outcome range
                shows the breadth. This avoids a second generic card gallery. */}
            <AssemblyExperience copy={t} ctaHref="/register" continuation />
            {/* SCENE 8 — conversion, after the system has been demonstrated */}
            <section data-a2-guide="final" className="mx-auto w-full max-w-[1180px] px-6 pb-20 pt-4 sm:pb-24 sm:pt-6">
            <h2 className="max-w-[34ch] text-[clamp(1.3rem,2.6vw,1.9rem)] font-semibold leading-[1.25] tracking-[-0.03em] text-[#F7F6F3]">
              <AccentLine text={acts.act4.h} accent={acts.act4.accent} />
            </h2>
            <p className="mt-3 max-w-[60ch] text-[14px] leading-[1.65] text-[#A1A8B3] sm:text-[15px]">
              {acts.act4.sub}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:gap-3">
              {acts.act4.chips.map((c) => (
                <span key={c} className="rounded-[4px] border border-[#2A303B] bg-[#12151B] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#c7ccd4]">
                  {c}
                </span>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/register"
                className="inline-flex min-h-11 items-center rounded-full border border-[#C9A76A] px-6 text-[15px] font-medium text-[#E2C486] no-underline transition-colors hover:bg-[#C9A76A] hover:text-[#14161A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C486]"
              >
                {acts.act4.cta}
              </Link>
              <p className="m-0 font-mono text-[10.5px] text-[#78808B]">{acts.act4.ctaNote}</p>
            </div>
            </section>
          </div>
        </SimplicityActs>
      </main>

      {/* Real routes under the world's coda: quiet, mono and indexable. */}
      <footer className="bg-[#08090b] px-5 pb-10 pt-2">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#8a919e]">
          <Link href="/services" className="transition-colors hover:text-[#c9a76a]">{nav.footer.services}</Link>
          <Link href="/how-it-works" className="transition-colors hover:text-[#c9a76a]">{nav.footer.how}</Link>
          <Link href="/inside" className="transition-colors hover:text-[#c9a76a]">{nav.footer.inside}</Link>
          <Link href="/about" className="transition-colors hover:text-[#c9a76a]">{nav.footer.about}</Link>
          <Link href="/workers" className="transition-colors hover:text-[#c9a76a]">{nav.footer.work}</Link>
        </nav>
      </footer>
    </>
  );
}
