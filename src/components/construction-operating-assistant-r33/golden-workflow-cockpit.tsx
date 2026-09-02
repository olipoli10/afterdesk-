import { Card, CardBody, LinkButton, PageTitle, SectionLabel } from "@/components/ui";
import type { GoldenWorkflowLocale, GoldenWorkflowProjection } from "@/lib/construction-operating-assistant-r33/contracts";
import { WEB_ROUTES } from "@/lib/construction-operating-assistant-r33/registry";
import { goldenWorkflowCopy, type GoldenWorkflowCopyKey } from "@/lib/i18n/construction-operating-assistant-r33";

function copy(locale: GoldenWorkflowLocale, key: string) {
  return goldenWorkflowCopy(locale, key as GoldenWorkflowCopyKey);
}

export function GoldenWorkflowCockpit({ displayLocale, snapshot }: { displayLocale: GoldenWorkflowLocale; snapshot: GoldenWorkflowProjection }) {
  const current = snapshot.steps.find((step) => step.step === snapshot.currentStep) ?? snapshot.steps[0];
  return (
    <main aria-labelledby="golden-workflow-title" className="space-y-6 text-[#F7F6F3]">
      <div id="golden-workflow-title" tabIndex={-1}>
        <PageTitle tone="night" title={copy(displayLocale, "cockpit.title")} sub={`${copy(displayLocale, "cockpit.body")} ${snapshot.workspace.name}${snapshot.project ? ` · ${snapshot.project.code}` : ""}`} />
      </div>

      <Card tone="night">
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <SectionLabel as="h2" tone="night">{copy(displayLocale, "cockpit.progress")}</SectionLabel>
              <p className="mt-2 text-2xl font-semibold">{snapshot.completedCount}/{snapshot.totalCount}</p>
              <p className="mt-1 text-sm text-[#A1A8B3]">{copy(displayLocale, current.titleKey)}</p>
            </div>
            <LinkButton href={WEB_ROUTES[snapshot.primaryAction.route]} tone="night">
              {copy(displayLocale, snapshot.primaryAction.copyKey)}
            </LinkButton>
          </div>
          <div role="progressbar" aria-label={copy(displayLocale, "cockpit.progress")} aria-valuemin={0} aria-valuemax={snapshot.totalCount} aria-valuenow={snapshot.completedCount} className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[#D6B878]" style={{ width: `${Math.round((snapshot.completedCount / snapshot.totalCount) * 100)}%` }} />
          </div>
        </CardBody>
      </Card>

      <ol aria-label={copy(displayLocale, "cockpit.progress")} className="grid gap-3 lg:grid-cols-2">
        {snapshot.steps.map((step) => (
          <li key={step.step} aria-current={step.step === snapshot.currentStep ? "step" : undefined}>
            <Card tone="night" className={step.step === snapshot.currentStep ? "border-[#D6B878]/70" : ""}>
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#D6B878]">{step.order}. {copy(displayLocale, `status.${step.status}`)}</p>
                    <h2 className="mt-2 text-lg font-semibold">{copy(displayLocale, step.titleKey)}</h2>
                  </div>
                  <span aria-hidden="true" className="text-lg">{step.status === "COMPLETE" ? "✓" : step.status === "BLOCKED" ? "!" : "·"}</span>
                </div>
                <p className="text-sm leading-6 text-[#A1A8B3]">{copy(displayLocale, step.bodyKey)}</p>
                {step.blockers.map((blocker) => <p role="alert" key={blocker.code} className="rounded-lg border border-[#8B5A35] bg-[#211810] p-3 text-sm">{copy(displayLocale, blocker.copyKey)}</p>)}
              </CardBody>
            </Card>
          </li>
        ))}
      </ol>

      <Card tone="night">
        <CardBody className="space-y-3">
          <SectionLabel as="h2" tone="night">{copy(displayLocale, "cockpit.external")}</SectionLabel>
          <p className="text-sm text-[#A1A8B3]">{copy(displayLocale, "cockpit.external_disabled")}</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
            {snapshot.externalCapabilities.map((capability) => <li key={capability.code} className="rounded-lg border border-white/10 p-3">{capability.code.replaceAll("_", " ")} · {copy(displayLocale, `status.BLOCKED`)}</li>)}
          </ul>
        </CardBody>
      </Card>
    </main>
  );
}

export function GoldenWorkflowUnavailable({ displayLocale }: { displayLocale: GoldenWorkflowLocale }) {
  return (
    <main aria-labelledby="golden-workflow-error-title" className="text-[#F7F6F3]">
      <Card tone="night">
        <CardBody className="space-y-4">
          <h1 id="golden-workflow-error-title" tabIndex={-1} className="text-xl font-semibold">{copy(displayLocale, "cockpit.unavailable")}</h1>
          <LinkButton href="/client/cockpit" tone="night">{copy(displayLocale, "action.RETRY")}</LinkButton>
        </CardBody>
      </Card>
    </main>
  );
}
