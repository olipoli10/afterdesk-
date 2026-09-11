import { redirect } from "next/navigation";
import { readPersonalModelOperatorFormView } from "@/server/model-gateway/personal-intent/operator-form";
import { OperatorForm } from "./operator-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion IA personnelle", robots: { index: false, follow: false } };

export default async function PersonalModelOperatorSetupPage() {
  const result = await readPersonalModelOperatorFormView();
  if (result.status === "AUTHENTICATION_REQUIRED") redirect("/login?next=%2Fpersonal%2Fmodel%2Foperator-setup");
  return <main className="mx-auto w-full max-w-2xl px-5 py-12 text-[#F5F5F5]">
    <p className="mb-3 text-sm font-semibold tracking-[0.2em] text-[#DBB878]">ENDVERA</p>
    <h1 className="text-3xl font-semibold tracking-tight">Connexion IA personnelle</h1>
    <p className="mt-4 text-base leading-relaxed text-[#BDC3CB]">Une connexion pour interpréter tes demandes. ENDVERA garde les contrôles et tes approbations avant les actions.</p>
    {result.status === "AVAILABLE" ? <OperatorForm view={result.view} /> :
      <section className="mt-8 rounded-2xl border border-[#34383E] bg-[#121418] p-6">
        <h2 className="text-xl font-semibold">Connexion pas encore disponible</h2>
        <p className="mt-3 leading-relaxed text-[#BDC3CB]">La configuration doit être prête et accessible à ton compte avant de saisir une clé. Ne colle aucune clé dans cette page ou dans une conversation.</p>
        <p className="mt-3 text-sm text-[#BDC3CB]">Aucun appel à un modèle, texto ou appel téléphonique n’est lancé ici.</p>
      </section>}
  </main>;
}
