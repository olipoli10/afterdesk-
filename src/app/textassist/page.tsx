import Link from "next/link";
import { cookies } from "next/headers";
import { LangSwitch } from "@/components/lang-switch";
import { Wordmark } from "@/components/logo";
import { CLIENT_LANGS, clientLangOf } from "@/lib/i18n/client";
import { TEXTASSIST_PUBLIC_COPY, TEXTASSIST_RELEASE_BOUNDARY } from "@/lib/textassist/public-copy";

export const metadata = {
  title: "ENDVERA TextAssist",
  description: "The conversational AI operating assistant for small construction businesses.",
};

export default async function TextAssistPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const raw = sp.lang ?? (await cookies()).get("ss-lang-client")?.value;
  const lang = clientLangOf(raw);
  const locale = lang === "fr" ? "fr" : "en";
  const copy = TEXTASSIST_PUBLIC_COPY[locale];
  const french = locale === "fr";

  return (
    <main className="min-h-screen bg-[#08090B] text-[#F7F6F3]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <Link href="/" aria-label="Endvera home"><Wordmark tone="paper" plate /></Link>
        <LangSwitch path="/textassist" current={lang} options={CLIENT_LANGS} tone="onyx" />
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:pb-24 sm:pt-24">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#D6B878]">{copy.eyebrow}</p>
        <h1 className="mt-5 max-w-5xl text-4xl font-semibold tracking-[-0.05em] sm:text-7xl">{copy.headline}</h1>
        <p className="mt-7 max-w-3xl text-lg leading-8 text-[#A1A8B3] sm:text-xl">{copy.promise}</p>
        <div className="mt-9 flex flex-wrap gap-4">
          <Link href="/register" className="rounded-full bg-[#D6B878] px-6 py-3 font-semibold text-[#14161A] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F7F6F3]">{copy.primaryCta}</Link>
          <Link href="/construction" className="rounded-full border border-[#D6B878]/60 px-6 py-3 font-semibold text-[#E2C486] no-underline">{copy.secondaryCta}</Link>
        </div>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#78808B]">{copy.availability}</p>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02] px-5 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">{copy.channelsTitle}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {copy.channels.map((channel) => (
              <article key={channel.title} className="rounded-2xl border border-white/10 bg-[#111318] p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#D6B878]">{channel.status}</p>
                <h3 className="mt-3 text-xl font-semibold">{channel.title}</h3>
                <p className="mt-3 leading-7 text-[#A1A8B3]">{channel.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <h2 className="text-3xl font-semibold tracking-[-0.03em]">{copy.outcomesTitle}</h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-2">
          {copy.outcomes.map((outcome) => (
            <article key={outcome.title} className="bg-[#0D0F13] p-6 sm:p-8">
              <h3 className="text-xl font-semibold">{outcome.title}</h3>
              <p className="mt-3 leading-7 text-[#A1A8B3]">{outcome.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="rounded-2xl border border-[#D6B878]/35 bg-[#D6B878]/[0.06] p-7 sm:p-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#D6B878]">{french ? "Autorité et confiance" : "Authority and trust"}</p>
          <h2 className="mt-3 text-3xl font-semibold">{copy.trustTitle}</h2>
          <p className="mt-4 max-w-3xl leading-7 text-[#A1A8B3]">{copy.trustBody}</p>
          <p className="mt-5 font-mono text-[10px] text-[#78808B]">
            providerObserved={String(TEXTASSIST_RELEASE_BOUNDARY.providerObserved)} · published={String(TEXTASSIST_RELEASE_BOUNDARY.published)}
          </p>
        </div>
        <nav aria-label={french ? "Liens de confiance" : "Trust links"} className="mt-8 flex flex-wrap gap-5 text-sm text-[#A1A8B3]">
          <Link href="/login" className="underline underline-offset-4">{french ? "Connexion" : "Sign in"}</Link>
          <Link href="/privacy" className="underline underline-offset-4">{french ? "Confidentialité" : "Privacy"}</Link>
          <Link href="/account-deletion" className="underline underline-offset-4">{french ? "Suppression de compte" : "Account deletion"}</Link>
          <Link href="/construction/support" className="underline underline-offset-4">{french ? "État du soutien" : "Support status"}</Link>
        </nav>
      </section>
    </main>
  );
}
