import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { taskForAdmin } from "@/lib/queries/tasks";
import { planReviewForAdmin } from "@/lib/queries/plan";
import { LocalTime } from "@/components/local-time";
import { PricingForm } from "@/components/pricing-form";
import { PlanReview } from "@/components/plan-review";
import {
  Card,
  CardBody,
  PageTitle,
  SectionLabel,
  Badge,
  formatBytes,
  linkInline,
  moneyClient,
  moneyPayout,
} from "@/components/ui";
import { aiConfidenceBadgeClass, aiConfidenceLabel } from "@/lib/status";

export default async function PricingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const task = await taskForAdmin(id);
  if (!task) notFound();
  if (!["submitted", "pricing_review"].includes(task.status)) {
    // Already priced (or moved on) — send the admin to the full task view.
    redirect(`/admin/tasks/${task.id}`);
  }
  // A standing task in `submitted` is unrouted work, not unpriced work: its
  // block already paid for it. The pricing form must never open on one, not
  // even by direct link.
  if (task.standingCapacityAccountId) {
    redirect(`/admin/tasks/${task.id}`);
  }

  const inputFiles = task.files.filter((f) => f.kind === "input");
  const [categories, planReview] = await Promise.all([
    prisma.taskCategory.findMany({
      where: { active: true },
      select: { id: true, name: true, slug: true },
      orderBy: { sortOrder: "asc" },
    }),
    planReviewForAdmin(task.id),
  ]);
  // The model names a category by slug (it has no idea what internal ids
  // exist); resolved to an id here so PricingForm's <select> — which is
  // keyed by id, like every other category picker in this admin — can
  // preselect it. A slug the model invents or that later goes inactive
  // just fails to match anything, which is fine: the dropdown falls back
  // to its own "Choose…" placeholder exactly as if no suggestion existed.
  const suggestedCategoryId =
    categories.find((c) => c.slug === task.aiSuggestedCategorySlug)?.id ?? "";

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title={task.title}
        sub={`From ${task.client.name} (${task.client.email})`}
        action={
          <Link
            href="/admin/pricing"
            className="text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
          >
            ← Queue
          </Link>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardBody>
            <SectionLabel as="h2" className="mb-2">
              Description
            </SectionLabel>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#14161A]">
              {task.description}
            </p>
            {task.quantity ? (
              <p className="mt-3 border-t border-[#14161A]/[0.06] pt-3 text-sm text-[#14161A]">
                <span className="text-xs text-[#5B6069]">Volume:</span> {task.quantity}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardBody>
              <SectionLabel as="h2" className="mb-2">
                Deadlines
              </SectionLabel>
              {task.clientDeadlineUtc ? (
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-[#5B6069]">Client receives by (your time)</dt>
                    <dd className="font-medium text-[#14161A]">
                      <LocalTime iso={task.clientDeadlineUtc} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#5B6069]">Same moment in Manila</dt>
                    <dd className="text-[#14161A]">
                      <LocalTime iso={task.clientDeadlineUtc} timeZone="Asia/Manila" />
                    </dd>
                  </div>
                  <p className="pt-1 text-xs text-[#5B6069]">
                    The worker deadline (client deadline − QC buffer) is computed automatically
                    at approval.
                  </p>
                </dl>
              ) : (
                <p className="text-sm text-[#5B6069]">No deadline set by the client.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-2 flex items-center justify-between gap-2">
                <SectionLabel as="h2">AI price suggestion</SectionLabel>
                <Badge className={aiConfidenceBadgeClass(task.aiConfidence)}>
                  {aiConfidenceLabel(task.aiConfidence)}
                </Badge>
              </div>
              {task.aiSuggestedPriceCents != null ? (
                <div className="space-y-2.5 text-sm">
                  <p>
                    <span className={`text-lg font-semibold ${moneyClient}`}>
                      ${(task.aiSuggestedPriceCents / 100).toFixed(0)}
                    </span>
                    {task.aiLowCents != null && task.aiHighCents != null ? (
                      <span className="ml-1.5 text-xs text-[#5B6069]">
                        (${(task.aiLowCents / 100).toFixed(0)} – ${(task.aiHighCents / 100).toFixed(0)})
                      </span>
                    ) : null}
                  </p>
                  {task.aiSuggestedVaPayoutCents != null ? (
                    <p className="text-xs text-[#5B6069]">
                      Suggested worker payout:{" "}
                      <span className={`font-medium ${moneyPayout}`}>
                        ${(task.aiSuggestedVaPayoutCents / 100).toFixed(0)}
                      </span>
                      {task.aiEstimatedMinutes ? ` · ~${task.aiEstimatedMinutes} min` : null}
                    </p>
                  ) : null}
                  {task.aiReasoning ? (
                    <p className="border-t border-[#14161A]/[0.06] pt-2.5 leading-relaxed text-[#5B6069]">
                      {task.aiReasoning}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-[#5B6069]">
                  {task.aiComputedAt
                    ? "The model found nothing usable for this task — price manually."
                    : "Not computed for this task (AI pricing not configured, or still in progress) — price manually for now."}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionLabel as="h2" className="mb-2">
                Client files ({inputFiles.length})
              </SectionLabel>
              {inputFiles.length === 0 ? (
                <p className="text-sm text-[#5B6069]">No files attached.</p>
              ) : (
                <ul className="divide-y divide-[#14161A]/[0.06] text-sm">
                  {inputFiles.map((f) => (
                    <li key={f.id} className="flex items-center justify-between py-2">
                      <a href={`/api/files/${f.id}/download`} className={`truncate ${linkInline}`}>
                        {f.fileName}
                      </a>
                      <span className="shrink-0 pl-2 font-mono text-xs tabular-nums text-[#5B6069]">
                        {formatBytes(f.sizeBytes)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Blocks A-C of the work engine: understanding, plan (versioned,
          editable), deterministic estimate with the calibration banner.
          Renders nothing at all for a task the pipeline never ran on. */}
      <PlanReview
        data={{
          taskId: task.id,
          classification: planReview.classification
            ? {
                objective: planReview.classification.objective,
                deliverableFormat: planReview.classification.deliverableFormat,
                requiredFields: planReview.classification.requiredFields,
                quantityInterpreted: planReview.classification.quantityInterpreted,
                geography: planReview.classification.geography,
                verificationLevel: planReview.classification.verificationLevel,
                sourceRequirements: planReview.classification.sourceRequirements,
                sensitiveData: planReview.classification.sensitiveData,
                requiredAccess: planReview.classification.requiredAccess,
                missingInformation: planReview.classification.missingInformation,
                assumptions: planReview.classification.assumptions,
                quoteTier: planReview.classification.quoteTier,
                confidence: planReview.classification.confidence,
              }
            : null,
          version: planReview.latestVersion
            ? {
                id: planReview.latestVersion.id,
                version: planReview.latestVersion.version,
                source: planReview.latestVersion.source,
                editNote: planReview.latestVersion.editNote,
                deliverableDescription: planReview.latestVersion.deliverableDescription,
                assumptions: planReview.latestVersion.assumptions,
                exclusions: planReview.latestVersion.exclusions,
                internalCostLikelyCents: planReview.latestVersion.internalCostLikelyCents,
                internalCostConservativeCents:
                  planReview.latestVersion.internalCostConservativeCents,
                suggestedPriceCents: planReview.latestVersion.suggestedPriceCents,
                suggestedVaPayoutCents: planReview.latestVersion.suggestedVaPayoutCents,
                calibration: planReview.latestVersion.calibration,
                steps: planReview.latestVersion.steps,
                critique: planReview.latestVersion.critique
                  ? {
                      severity: planReview.latestVersion.critique.severity,
                      overallAssessment: planReview.latestVersion.critique.overallAssessment,
                      missingSteps: planReview.latestVersion.critique.missingSteps,
                      wrongToolFlags: planReview.latestVersion.critique.wrongToolFlags,
                      timeRiskFlags: planReview.latestVersion.critique.timeRiskFlags,
                      securityRiskFlags: planReview.latestVersion.critique.securityRiskFlags,
                    }
                  : null,
              }
            : null,
          history: planReview.history.map((h) => ({
            version: h.version,
            source: h.source,
            editNote: h.editNote,
            suggestedPriceCents: h.suggestedPriceCents,
            suggestedVaPayoutCents: h.suggestedVaPayoutCents,
          })),
        }}
      />

      <PricingForm
        // Remount when the plan version advances: after "Save as vN+1 &
        // re-price", router.refresh() alone keeps the OLD useState numbers
        // under the NEW planVersionId and mislabels the stale combo as a
        // deliberate adjustment (adversarial review). A version change means
        // the suggestion changed under the form; re-initialize from it.
        key={planReview.latestVersion?.id ?? "no-plan"}
        taskId={task.id}
        fileCount={inputFiles.length}
        categories={categories}
        planVersionId={planReview.latestVersion?.id ?? null}
        aiSuggestion={
          task.aiSuggestedPriceCents != null
            ? {
                priceCents: task.aiSuggestedPriceCents,
                vaPayoutCents: task.aiSuggestedVaPayoutCents,
                estimatedMinutes: task.aiEstimatedMinutes,
                categoryId: suggestedCategoryId,
                confidence: task.aiConfidence,
              }
            : null
        }
      />
    </div>
  );
}
