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
import { AssemblyExperience } from "./_home/assembly-experience";
import { A2Concierge } from "./_home/a2-concierge";

/* ---------------------------------------------------------------------------
   The real homepage IS the accepted V5.5 "Assembly Lock" experience
   (Codex GO 9.2/10), ported faithfully from the frozen prototype, plus the
   single A2 concierge (Phase 1.4B). One request enters; AfterDesk assembles
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
    title: "One request in. One verified result out. | AfterDesk",
    description:
      "Describe the result you need. AfterDesk assembles software, models, connected tools, browser work and bounded human review, then delivers one checked result at an approved fixed price.",
  },
  fr: {
    title: "Une demande entre. Un résultat vérifié ressort. | AfterDesk",
    description:
      "Décrivez le résultat qu'il vous faut. AfterDesk assemble logiciels, modèles, outils connectés, travail navigateur et révision humaine bornée, puis livre un résultat vérifié à un prix fixe approuvé.",
  },
  es: {
    title: "Entra una solicitud. Sale un resultado verificado. | AfterDesk",
    description:
      "Describa el resultado que necesita. AfterDesk ensambla software, modelos, herramientas conectadas, trabajo de navegador y revisión humana acotada, y entrega un resultado verificado a un precio fijo aprobado.",
  },
  tl: {
    title: "Isang kahilingan ang pumapasok. Isang beripikadong resulta ang lumalabas. | AfterDesk",
    description:
      "Ilarawan ang resultang kailangan mo. Binubuo ng AfterDesk ang software, mga modelo, konektadong tools, browser na trabaho at may hangganang pagsusuri ng tao, at naghahatid ng isang siniyasat na resulta sa aprubadong fixed na presyo.",
  },
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = clientLangOf(sp.lang);
  return { ...HOME_META[lang], alternates: langAlternates("/", sp.lang) };
}

const ORG_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "AfterDesk",
  url: SITE_URL,
  description:
    "AfterDesk assembles software, models, connected tools, browser work and bounded human review, and delivers one checked result at an approved fixed price. Early Access.",
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
      {/* minimal chrome, LEFT only - the V5.5 experience owns the top-right
          (its anchor nav + Early Access badge). No overlap by construction. */}
      <header className="absolute inset-x-0 top-0 z-50">
        <div className="flex items-center gap-4 px-5 py-4 font-mono text-[11px] uppercase tracking-[0.16em] text-[#8a919e]">
          <Link href="/" className="text-[#e2c486] transition-colors hover:text-[#c9a76a]">
            AfterDesk
          </Link>
          {portal ? (
            <Link href={portal} className="transition-colors hover:text-[#c9a76a]">
              {nav.nav.portal}
            </Link>
          ) : (
            <Link href="/login" className="transition-colors hover:text-[#c9a76a]">
              {nav.nav.signIn}
            </Link>
          )}
          <LangSwitch path="/" current={lang} options={CLIENT_LANGS} tone="night" />
        </div>
      </header>

      <main>
        <AssemblyExperience copy={t} ctaHref="/register" />
      </main>

      {/* real routes under the world's coda - quiet, mono, indexable */}
      <footer className="bg-[#08090b] px-5 pb-10 pt-2">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#8a919e]">
          <Link href="/services" className="transition-colors hover:text-[#c9a76a]">{nav.footer.services}</Link>
          <Link href="/how-it-works" className="transition-colors hover:text-[#c9a76a]">{nav.footer.how}</Link>
          <Link href="/inside" className="transition-colors hover:text-[#c9a76a]">{nav.footer.inside}</Link>
          <Link href="/about" className="transition-colors hover:text-[#c9a76a]">{nav.footer.about}</Link>
          <Link href="/workers" className="transition-colors hover:text-[#c9a76a]">{nav.footer.work}</Link>
        </nav>
      </footer>

      <A2Concierge copy={concierge} />
    </>
  );
}
