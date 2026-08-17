import Link from "next/link";
import { cookies } from "next/headers";
import { PublicShell } from "@/components/public-shell";
import { InstrumentFrame, Kicker } from "@/components/instruments";
import { OFFERINGS } from "@/lib/offerings";
import { langAlternates } from "@/lib/i18n/langs";
import { SERVICES_I18N, docLangOf } from "@/lib/i18n/services";
import { pageConcierge } from "@/lib/i18n/public-shell";

/* ─────────────────────────────────────────────────────────────────────────
   /services — 1.4C: from a static SaaS grid to operational proof.
   The four families keep their exact published copy (SERVICES_I18N,
   joined BY INDEX to OFFERINGS as before); what changed is that each
   family now carries a DISTINCT miniature instrument — a visual signature
   of what the work actually looks like — plus the shared
   request → scope → assembled method → verification → result line.
   The signatures are decorative (aria-hidden) mono sketches; every claim
   still comes from the dictionary. No new commercial capability. */

async function resolveLang(sp: { lang?: string }) {
  const jar = await cookies();
  return docLangOf(sp.lang, jar.get("ss-lang-doc")?.value, jar.get("ss-lang-client")?.value, jar.get("ss-lang-worker")?.value);
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const t = SERVICES_I18N[await resolveLang(sp)];
  return { title: t.meta.title, description: t.meta.description, alternates: langAlternates("/services", sp.lang) };
}

/* one miniature signature per family - each reads as a different operation */
function FamilySignature({ slug }: { slug: string }) {
  const row = "flex items-baseline gap-2 font-mono text-[10.5px] leading-[1.9]";
  const dim = "text-[#5B6069]";
  const lit = "text-[#c7ccd4]";
  const gold = "text-[#E2C486]";
  if (slug === "data")
    return (
      <div aria-hidden className="mt-5 border-t border-white/8 pt-3">
        <p className={row}><span className={dim}>0412</span><span className={lit}>Acme Corp · maria@acme.com</span></p>
        <p className={row}><span className={dim}>0413</span><span className={`${dim} line-through`}>Acme Corp. · m.santos@acme.com</span><span className={gold}>→ merged</span></p>
        <p className={row}><span className={dim}>0414</span><span className={lit}>Borealis Ltd · claims checked</span><span className={gold}>✓</span></p>
      </div>
    );
  if (slug === "research")
    return (
      <div aria-hidden className="mt-5 border-t border-white/8 pt-3">
        <p className={row}><span className={dim}>src</span><span className={lit}>registre.qc ▸ 2026-07</span></p>
        <p className={row}><span className={dim}>val</span><span className={lit}>employees: 48</span><span className={gold}>✓ sourced</span></p>
        <p className={row}><span className={dim}>val</span><span className={dim}>direct line: unavailable</span><span className={gold}>· declared</span></p>
      </div>
    );
  if (slug === "writing")
    return (
      <div aria-hidden className="mt-5 border-t border-white/8 pt-3">
        <p className={row}><span className={dim}>p.14</span><span className={lit}>termination clause ▸ extracted</span></p>
        <p className={row}><span className={dim}>p.31</span><span className={lit}>renewal date ▸ 2027-03-01</span><span className={gold}>✓</span></p>
        <p className={row}><span className={dim}>out</span><span className={lit}>your-template.docx · rebuilt</span></p>
      </div>
    );
  return (
    <div aria-hidden className="mt-5 border-t border-white/8 pt-3">
      <p className={row}><span className={gold}>✓</span><span className={lit}>12 records checked against ledger</span></p>
      <p className={row}><span className={gold}>✓</span><span className={lit}>3 files compiled, named to scheme</span></p>
      <p className={row}><span className={dim}>↺</span><span className={dim}>1 exception listed, never guessed</span></p>
    </div>
  );
}

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = SERVICES_I18N[lang];

  return (
    <PublicShell variant="night" lang={lang} path="/services" concierge={pageConcierge("services", lang)}>
      <div className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-16 sm:pt-24">
        <Kicker>{t.eyebrow}</Kicker>
        <h1 className="mt-4 max-w-[21ch] text-[clamp(2.4rem,5.5vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.04em]">{t.h1}</h1>
        <p className="mt-6 max-w-[64ch] text-[17px] leading-[1.65] text-[#A9AFB8]">{t.intro}</p>

        {/* the shared operating line every family runs through */}
        <div aria-hidden className="mt-12 hidden items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#5B6069] lg:flex">
          {["request", "scope · fixed price", "assembled method", "verification", "result"].map((step, i) => (
            <span key={step} className="flex items-center gap-3">
              {i > 0 && <span className="h-px w-8 bg-gradient-to-r from-transparent via-[#C9A76A66] to-transparent" />}
              <span className={i === 4 ? "text-[#E2C486]" : undefined}>{step}</span>
            </span>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {OFFERINGS.map((offering, i) => {
            const copy = t.offerings[i];
            return (
              <InstrumentFrame
                key={offering.slug}
                tone="night"
                proof={`family-${offering.slug}`}
                className="group p-7 transition-colors hover:border-[#C9A76A]/50 focus-within:border-[#C9A76A]/50"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#C9A76A]">{copy.audience}</p>
                <h2 className="mt-3 text-[24px] font-semibold">{copy.title}</h2>
                <p className="mt-3 text-[15px] leading-[1.65] text-[#9AA1AB]">{copy.description}</p>
                <FamilySignature slug={offering.slug} />
                <Link
                  href={offering.href}
                  className="mt-6 inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[#F7F6F3] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C486]"
                >
                  {t.learnMore}
                  <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              </InstrumentFrame>
            );
          })}
        </div>
      </div>
    </PublicShell>
  );
}
