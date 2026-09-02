import Link from "next/link";
import { Card, CardBody, PageTitle, SectionLabel } from "@/components/ui";
import type { OwnerCommercialProjection } from "@/lib/construction-operating-assistant-r34/contracts";
import { COMMERCIAL_I18N } from "@/lib/i18n/construction-operating-assistant-r34";

const METRIC_LABELS = {
  "fr-CA": {
    ACTIVE_PROJECTS: "Chantiers actifs", ACTIVE_MEMBERS: "Membres actifs", INGESTED_MESSAGES: "Messages reçus",
    EVIDENCE_REFERENCES: "Preuves référencées", PREPARED_ACTIONS: "Actions préparées", OPEN_FOLLOW_UPS: "Suivis ouverts", HUMAN_ESCALATIONS: "Interventions humaines",
  },
  "en-CA": {
    ACTIVE_PROJECTS: "Active projects", ACTIVE_MEMBERS: "Active members", INGESTED_MESSAGES: "Messages ingested",
    EVIDENCE_REFERENCES: "Evidence references", PREPARED_ACTIONS: "Prepared actions", OPEN_FOLLOW_UPS: "Open follow-ups", HUMAN_ESCALATIONS: "Human escalations",
  },
} as const;

export function CommercialAccountPanel({ projection, locale }: { projection: OwnerCommercialProjection; locale: "fr-CA" | "en-CA" }) {
  const copy = COMMERCIAL_I18N[locale];
  const french = locale === "fr-CA";
  return (
    <main aria-labelledby="commercial-title" className="space-y-6 text-[#F7F6F3]">
      <div id="commercial-title" tabIndex={-1}>
        <PageTitle tone="night" title={copy.title} sub={`${copy.subtitle} ${projection.workspace.name}`} />
      </div>
      <Card tone="night">
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <SectionLabel as="h2" tone="night">{french ? "Plan actuel" : "Current plan"}</SectionLabel>
              <p className="mt-2 text-xl font-semibold">{projection.account?.planKey.replaceAll("_", " ") ?? copy.noAccount}</p>
              {projection.account ? <p className="mt-1 text-sm text-[#A1A8B3]">{projection.account.state.replaceAll("_", " ")} · v{projection.account.accountVersion}</p> : null}
            </div>
            <div className="rounded-lg border border-[#D6B878]/40 px-4 py-3 text-right">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#D6B878]">{copy.priceUnavailable}</p>
              <p className="mt-1 text-sm text-[#A1A8B3]">{copy.billingDisabled}</p>
            </div>
          </div>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {projection.plan.includedFeatures.map((feature) => <li key={feature} className="rounded-lg border border-white/10 p-3">✓ {feature.replaceAll("_", " ")}</li>)}
          </ul>
        </CardBody>
      </Card>
      <section aria-labelledby="usage-title">
        <h2 id="usage-title" className="text-lg font-semibold">{french ? "Usage observé" : "Observed usage"}</h2>
        <p className="mt-1 text-sm text-[#A1A8B3]">{copy.informationalUsage}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {projection.usage.readings.map((reading) => (
            <div key={reading.metric} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <dt className="text-sm text-[#A1A8B3]">{METRIC_LABELS[locale][reading.metric]}</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">{reading.quantity}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Card tone="night">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <SectionLabel as="h2" tone="night">{copy.support}</SectionLabel>
            <p className="mt-2 text-sm text-[#A1A8B3]">{projection.support.prepared + projection.support.active + projection.support.attentionRequired} {french ? "dossier(s) ouvert(s)" : "open item(s)"} · {projection.support.nextOwner}</p>
          </div>
          <Link href="/client/support" className="rounded-lg border border-[#D6B878] px-4 py-2 text-sm font-semibold text-[#F7F6F3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D6B878]">
            {french ? "Voir l’appui humain" : "View human support"}
          </Link>
        </CardBody>
      </Card>
      <p className="text-sm text-[#A1A8B3]">{french ? "SMS, appels, calendriers, comptabilité et facturation réels demeurent désactivés." : "Live SMS, calls, calendars, accounting and billing remain disabled."}</p>
    </main>
  );
}
