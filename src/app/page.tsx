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

/* ---------------------------------------------------------------------------
   The real homepage IS the accepted V5.5 "Assembly Lock" experience
   (Codex GO 9.2/10), ported faithfully from the frozen prototype, plus the
   single A2 concierge (Phase 1.4B). One request enters; ENDVERA coordinates
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
    title: "One request in. One verified result out. | ENDVERA",
    description:
      "Give ENDVERA a bounded workflow. AI, software, browser work, authorized systems and human judgment are coordinated; a person verifies the finished, documented result.",
  },
  fr: {
    title: "Une demande entre. Un résultat vérifié ressort. | ENDVERA",
    description:
      "Confiez un workflow borné à ENDVERA. IA, logiciels, travail navigateur, systèmes autorisés et jugement humain sont coordonnés; une personne vérifie le résultat fini et documenté.",
  },
  es: {
    title: "Entra una solicitud. Sale un resultado verificado. | ENDVERA",
    description:
      "Entregue a ENDVERA un flujo de trabajo acotado. Se coordinan IA, software, navegador, sistemas autorizados y criterio humano; una persona verifica el resultado terminado y documentado.",
  },
  tl: {
    title: "Isang kahilingan ang pumapasok. Isang beripikadong resulta ang lumalabas. | ENDVERA",
    description:
      "Ibigay sa ENDVERA ang isang nakatakdang workflow. Kino-coordinate ang AI, software, browser work, mga awtorisadong system at paghatol ng tao; isang tao ang sumusuri sa tapos at dokumentadong resulta.",
  },
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = clientLangOf(sp.lang);
  /* HOME_META titles already carry "| ENDVERA"; absolute keeps the root
     layout's "%s · ENDVERA" template from adding the brand a second time */
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
  name: "ENDVERA",
  url: SITE_URL,
  description:
    "ENDVERA coordinates bounded workflows across AI, software, browser work, authorized systems and human judgment. A person checks the finished, documented result; the verified result is then delivered. Early Access.",
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

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ORG_JSONLD }} />

      {/* V7: ONE premium header for the whole story - the single wordmark
          of the document. The V5.5 machine below renders in continuation
          mode and no longer draws its own nav. */}
      <header data-site-header="" className="absolute inset-x-0 top-0 z-50 overflow-x-clip">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 text-[#F7F6F3] sm:gap-x-5 sm:gap-y-2 sm:px-6 sm:pt-9">
          <Link data-site-wordmark="" href="/" aria-label="ENDVERA home" className="inline-flex min-h-11 min-w-0 items-center text-[0.875rem] text-inherit no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C486] sm:text-[1.0625rem]">
            <Wordmark tone="paper" />
          </Link>
          <span
            key="page-utilities"
            className="order-3 flex min-w-0 basis-full items-center gap-4 font-mono text-[12px] uppercase tracking-[0.14em] text-[#9AA1AB] md:order-none md:basis-auto"
          >
            {portal ? (
              <Link href={portal} className="inline-flex min-h-11 items-center transition-colors hover:text-[#c9a76a]">
                {nav.nav.portal}
              </Link>
            ) : (
              <Link href="/login" className="inline-flex min-h-11 items-center transition-colors hover:text-[#c9a76a]">
                {nav.nav.signIn}
              </Link>
            )}
            <LangSwitch path="/" current={lang} options={CLIENT_LANGS} tone="night" />
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-8">
            <a href="#outcomes" className="hidden text-[0.875rem] text-[#9AA1AB] no-underline transition-colors hover:text-[#F7F6F3] md:inline">{t.nav.outcomes}</a>
            <a href="#how" className="hidden text-[0.875rem] text-[#9AA1AB] no-underline transition-colors hover:text-[#F7F6F3] md:inline">{t.nav.how}</a>
            <a href="#inside" className="hidden text-[0.875rem] text-[#9AA1AB] no-underline transition-colors hover:text-[#F7F6F3] md:inline">{t.nav.inside}</a>
            <span data-early-access="" className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full border border-white/15 px-2 py-1 font-mono text-[12px] uppercase tracking-[0.04em] text-[#9AA1AB] sm:gap-[0.4375rem] sm:px-3 sm:py-1.5 sm:tracking-[0.06em]">
              <span aria-hidden className="h-1 w-1 rounded-full bg-[#C9A76A]" />
              {t.nav.earlyAccess}
            </span>
          </span>
        </div>
      </header>

      <main className="overflow-x-clip bg-[#08090B]">
        {/* V7 - the four simplicity acts tell the whole opening story; the
            accepted V5.5 machine continues it (internal geometry frozen).
            The acts own the single A2 being. */}
        <SimplicityActs copy={V7_ACTS_I18N[clientLangOf(raw)]} concierge={concierge} />
        <div data-v7-sem="example">
          <AssemblyExperience copy={t} ctaHref="/register" continuation />
        </div>
      </main>

      {/* real routes under the world's coda - quiet, mono, indexable */}
      <footer className="bg-[#08090b] px-5 pb-10 pt-2">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[12px] uppercase tracking-[0.14em] text-[#9AA1AB]">
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
