import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { personalAnswerReportForOwner } from "@/server/personal-assistant/answer-report";
import { propertyReportForOwner } from "@/server/model-gateway/property-research/jobs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ton rapport — ENDVERA", robots: { index: false, follow: false } };

export default async function AssistantReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "CLIENT" || !user.emailVerified) redirect(`/login?next=${encodeURIComponent(`/personal/assistant-reports/${reportId}`)}`);
  const report = await personalAnswerReportForOwner(user.id, reportId);
  if (!report) {
    const property = await propertyReportForOwner(user.id, reportId);
    if (!property) notFound();
    return <main className="mx-auto max-w-3xl px-5 py-10 text-[#F5F5F5]">
      <p className="text-sm font-semibold tracking-widest text-[#DBB878]">ENDVERA — RECHERCHE DE TERRAIN</p>
      <h1 className="mt-4 text-3xl font-semibold">{property.address?.address ?? "Adresse à préciser"}</h1>
      {property.evidenceMode === "SYNTHETIC" && <p className="mt-5 rounded-xl border border-amber-600 p-4 text-amber-200">Démonstration synthétique : ces données ne décrivent aucun propriétaire réel.</p>}
      <p className="mt-6">{property.nextDecision}</p>
      <p className="mt-3 text-sm text-[#BDC3CB]">Le titulaire légal du droit de propriété n’est pas confirmé par ce rapport.</p>
      {property.lots.map(lot => <section key={lot.lotId} className="mt-6 rounded-2xl border border-[#34383E] bg-[#121418] p-5">
        <h2 className="text-xl font-semibold">Lot {lot.lotId}</h2>
        {lot.assessment.map((record, index) => <div key={`${record.source.sourceId}-${index}`} className="mt-4">
          <p>Nom inscrit au rôle : {record.listedOwner}</p>
          <a href={record.source.url} target="_blank" rel="noopener noreferrer" className="text-[#DBB878] underline">Voir la source — {record.source.documentVersion}</a>
          <p className="text-sm text-[#BDC3CB]">Date des données : {new Date(record.source.effectiveAt).toLocaleDateString("fr-CA", { timeZone: "America/Toronto" })}</p>
        </div>)}
      </section>)}
      {!!property.findings.length && <section className="mt-6"><h2 className="text-xl font-semibold">Points à vérifier</h2>
        <ul className="mt-3 list-inside list-disc">{property.findings.map((finding, index) => <li key={index}>{findingLabel[finding.code]}</li>)}</ul>
      </section>}
    </main>;
  }
  return <main className="mx-auto max-w-3xl px-5 py-10 text-[#F5F5F5]">
    <p className="text-sm font-semibold tracking-widest text-[#DBB878]">ENDVERA</p>
    <h1 className="mt-4 text-3xl font-semibold">Ta recherche, avec ses sources</h1>
    <p className="mt-3 text-sm text-[#BDC3CB]">Consulté le {new Date(report.observedAt).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} — heure du Québec</p>
    <section className="mt-8 rounded-2xl border border-[#34383E] bg-[#121418] p-6">
      <p className="whitespace-pre-wrap leading-relaxed">{report.text}</p>
    </section>
    {report.citations.length > 0 && <section className="mt-8 space-y-5">
      <h2 className="text-xl font-semibold">Sources consultées</h2>
      {report.citations.map(source => <article key={source.id} className="rounded-xl border border-[#34383E] p-5">
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-words text-[#DBB878] underline">{source.title}</a>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#BDC3CB]">{source.excerpt}</p>
      </article>)}
      <p className="text-sm text-[#BDC3CB]">Ces extraits décrivent ce que les sources indiquent. Une inscription au rôle d’évaluation ne confirme pas à elle seule un titre de propriété.</p>
    </section>}
  </main>;
}

const findingLabel = {
  SOURCE_STALE: "Une source est ancienne; son information doit être revérifiée.", SOURCE_UNAVAILABLE: "Une source n’a pas pu être consultée.",
  ADDRESS_AMBIGUOUS: "Plusieurs adresses correspondent à la demande.", NO_LOTS: "Aucun lot n’a pu être associé à l’adresse.",
  OWNER_CONTRADICTION: "Les sources indiquent des noms de propriétaires différents.", COMPANY_NAME_MISMATCH: "Le nom de l’entreprise ne correspond pas au rôle.",
  MISSING_ASSESSMENT: "Le rôle d’évaluation manque pour un lot.",
};
