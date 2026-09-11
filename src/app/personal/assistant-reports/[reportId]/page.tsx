import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { personalAnswerReportForOwner } from "@/server/personal-assistant/answer-report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ton rapport — ENDVERA", robots: { index: false, follow: false } };

export default async function AssistantReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "CLIENT" || !user.emailVerified) redirect(`/login?next=${encodeURIComponent(`/personal/assistant-reports/${reportId}`)}`);
  const report = await personalAnswerReportForOwner(user.id, reportId);
  if (!report) notFound();
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
