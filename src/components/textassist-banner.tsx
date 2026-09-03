import Link from "next/link";
import type { TextAssistLocale } from "@/lib/textassist/public-copy";

const BANNER_COPY = {
  fr: {
    eyebrow: "Nouveau · ENDVERA TextAssist",
    title: "Ton chantier avance par une simple conversation.",
    body: "Rendez-vous, suivis, messages préparés et prochaines décisions, avec le contexte opérationnel du bon chantier.",
    boundary: "Aperçu local · aucun envoi externe",
    cta: "Découvrir TextAssist",
  },
  en: {
    eyebrow: "New · ENDVERA TextAssist",
    title: "Keep every job moving through one conversation.",
    body: "Appointments, follow-ups, prepared messages and next decisions, with the operational context of the right job.",
    boundary: "Local preview · no external sending",
    cta: "Discover TextAssist",
  },
} as const;

export function TextAssistBanner({ locale }: { locale: TextAssistLocale }) {
  const copy = BANNER_COPY[locale];
  return (
    <section aria-labelledby="textassist-banner-title" className="border-y border-[#2A303B] bg-[#0D0F13] px-5 pb-10 pt-28 text-[#F7F6F3] sm:pb-14 sm:pt-32">
      <div className="mx-auto grid w-full max-w-[1180px] gap-7 rounded-2xl border border-[#D6B878]/30 bg-[radial-gradient(circle_at_top_right,rgba(216,117,38,0.16),transparent_42%)] p-6 sm:p-9 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#D6B878]">{copy.eyebrow}</p>
          <h2 id="textassist-banner-title" className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            {copy.title}
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#A1A8B3] sm:text-base">
            {copy.body}
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#78808B]">{copy.boundary}</p>
        </div>
        <Link href="/textassist" className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#D6B878] px-6 font-semibold text-[#E2C486] no-underline transition-colors hover:bg-[#D6B878] hover:text-[#14161A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F7F6F3]">
          {copy.cta}
        </Link>
      </div>
    </section>
  );
}
