import Link from "next/link";
import { Wordmark } from "@/components/logo";

export const metadata = {
  title: "Account deletion | ENDVERA",
  description: "How to request deletion of an ENDVERA local account.",
};

export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-[#08090B] px-5 py-8 text-[#F7F6F3]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" aria-label="Endvera home"><Wordmark tone="paper" plate /></Link>
        <p className="mt-20 font-mono text-xs uppercase tracking-[0.18em] text-[#D6B878]">Compte · Account</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Demander la suppression d’un compte</h1>
        <p className="mt-6 text-lg leading-8 text-[#A1A8B3]">
          Cette page ne supprime pas automatiquement un compte. Le produit est encore une build locale et aucun service de suppression en production n’est actif.
        </p>
        <p className="mt-4 text-lg leading-8 text-[#A1A8B3]">
          This page does not delete an account automatically. The product is still a local build and no production deletion service is active.
        </p>
        <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <h2 className="text-xl font-semibold">Étape actuelle · Current step</h2>
          <p className="mt-3 leading-7 text-[#A1A8B3]">
            Connecte-toi pour identifier le compte local, puis consulte l’état du soutien. Aucune action sur cette page n’efface de données.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link href="/login" className="rounded-full bg-[#D6B878] px-6 py-3 font-semibold text-[#14161A] no-underline">Connexion</Link>
            <Link href="/construction/support" className="rounded-full border border-[#D6B878]/60 px-6 py-3 font-semibold text-[#E2C486] no-underline">État du soutien</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
