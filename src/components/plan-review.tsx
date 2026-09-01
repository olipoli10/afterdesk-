"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editPlanVersion } from "@/server/actions/admin-plan";
// From the vocabulary modules, NOT from schemas.ts: this is a client component
// and schemas.ts is server-only, so importing it here would fail the build.
import { PLAN_PRIMITIVE_IDS, primitiveReadsFiles } from "@/lib/ai-work-engine/primitive-vocabulary";
import {
  OUTPUT_FORMAT_LABELS,
  RECURRENCE_LABELS,
  SOURCE_SHAPE_LABELS,
  VERIFICATION_EXPECTATION_LABELS,
  type OutputFormatCode,
  type Recurrence,
  type SourceShape,
  type VerificationExpectation,
} from "@/lib/ai-work-engine/intake-framing";
import {
  Badge,
  Card,
  CardBody,
  Field,
  SectionLabel,
  inputClass,
  buttonPrimary,
  moneyClient,
  moneyPayout,
} from "@/components/ui";

/**
 * Blocks A-C of the work-engine review, above the existing pricing form
 * (block D). Editing NEVER mutates a version: Save calls editPlanVersion,
 * which inserts version N+1 and re-runs only the deterministic pricing —
 * zero model calls on an edit.
 *
 * Everything here is admin-only. Internal costs, confidence and the critique
 * have no client-facing representation anywhere, and this component is the
 * only place they render.
 */

export type PlanStepView = {
  order: number;
  title: string;
  description: string;
  executor: "ai" | "human" | "deterministic_code";
  humanRole: "worker" | "specialist" | "reviewer" | "admin" | null;
  tool: string | null;
  primitiveId: string | null;
  primitiveVersion: number | null;
  /** The capability's frozen configuration, opaque to this component. */
  params: unknown;
  humanOutputSchema: unknown;
  humanRequiredArtifactKinds: string[];
  fixedMinutes: number | null;
  secondsPerUnit: number | null;
  estimatedMinutesOptimistic: number;
  estimatedMinutesLikely: number;
  estimatedMinutesConservative: number;
  estimatedAiCostCents: number;
  estimatedToolUnits: number;
  verificationMethod: string;
  acceptanceCriteria: string[];
  riskLevel: "low" | "medium" | "high";
  riskNote: string | null;
  dependsOnOrder: number[];
};

export type PlanReviewData = {
  taskId: string;
  classification: {
    objective: string;
    deliverableFormat: string;
    requiredFields: string[];
    quantityInterpreted: number | null;
    geography: string[];
    verificationLevel: string;
    sourceRequirements: string[];
    sensitiveData: boolean;
    requiredAccess: string[];
    missingInformation: string[];
    assumptions: string[];
    quoteTier: "assisted" | "manual";
    confidence: "low" | "medium" | "high";
    /**
     * LOT C intake framing — null on classifications recorded before it.
     * Loosely typed as strings on purpose: the closed vocabulary lives in
     * intake-framing.ts and an unknown value renders as itself rather than
     * crashing the pricing screen.
     */
    sourceShape: string | null;
    verificationExpectation: string | null;
    outputFormatCode: string | null;
    recurrence: string | null;
  } | null;
  version: {
    id: string;
    version: number;
    source: "ai_generated" | "admin_edited";
    editNote: string | null;
    deliverableDescription: string;
    assumptions: string[];
    exclusions: string[];
    internalCostLikelyCents: number;
    internalCostConservativeCents: number;
    suggestedPriceCents: number;
    suggestedVaPayoutCents: number;
    calibration: "uncalibrated" | "partial" | "calibrated";
    steps: PlanStepView[];
    critique: {
      severity: "none" | "minor" | "major" | "blocking";
      overallAssessment: string;
      missingSteps: string[];
      wrongToolFlags: string[];
      timeRiskFlags: string[];
      securityRiskFlags: string[];
    } | null;
  } | null;
  history: {
    version: number;
    source: "ai_generated" | "admin_edited";
    editNote: string | null;
    suggestedPriceCents: number;
    suggestedVaPayoutCents: number;
  }[];
  /**
   * LOT A: the task's own input attachments, so a file-reading step's fileId
   * is a SELECTION, never something an operator types. The server action
   * re-verifies ownership regardless — this list is convenience, the action
   * is the wall.
   */
  attachments: { id: string; fileName: string; sizeBytes: number }[];
};

const EXECUTORS = ["ai", "human", "deterministic_code"] as const;
const HUMAN_ROLES = ["worker", "specialist", "reviewer", "admin"] as const;
const RISKS = ["low", "medium", "high"] as const;
const TOOLS = ["", "web_search", "internal_script", "spreadsheet", "manual"] as const;

const EXECUTOR_LABEL: Record<string, string> = {
  ai: "AI",
  human: "Human",
  deterministic_code: "Script",
};

function severityBadge(severity: string): string {
  switch (severity) {
    case "blocking":
      return "border-[#8C2F23]/40 bg-[#8C2F23]/10 text-[#8C2F23]";
    case "major":
      return "border-[#955710]/40 bg-[#D98324]/10 text-[#955710]";
    case "minor":
      return "border-black/12 bg-black/[0.03] text-[#5B6069]";
    default:
      return "border-[#1E7F5C]/40 bg-[#1E7F5C]/10 text-[#166049]";
  }
}

const usd = (cents: number) => `$${(cents / 100).toFixed(0)}`;

type EditableStep = {
  title: string;
  description: string;
  executor: (typeof EXECUTORS)[number];
  humanRole: (typeof HUMAN_ROLES)[number] | "";
  tool: string;
  primitiveId: string;
  /**
   * The step's capability configuration. LOT A gives it a real editor at
   * last: file-reading primitives get an attachment picker plus their few
   * named fields; every other primitive gets a JSON editor whose parse state
   * is tracked so an invalid edit blocks Save loudly instead of freezing a
   * configuration the compiler will silently refuse into human work.
   */
  params: unknown;
  humanOutputSchema: unknown;
  humanRequiredArtifactKinds: string[];
  /** The JSON editor's raw text, kept in sync with `params` on valid edits. */
  paramsText: string;
  /** True while paramsText is not valid JSON — Save is blocked. */
  paramsError: boolean;
  fixedMinutes: string;
  secondsPerUnit: string;
  optimistic: string;
  likely: string;
  conservative: string;
  aiCostCents: string;
  toolUnits: string;
  verificationMethod: string;
  acceptanceCriteria: string;
  riskLevel: (typeof RISKS)[number];
  riskNote: string;
  dependsOn: string;
};

function toEditable(s: PlanStepView): EditableStep {
  return {
    title: s.title,
    description: s.description,
    executor: s.executor,
    humanRole: s.humanRole ?? "",
    tool: s.tool ?? "",
    primitiveId: s.primitiveId ?? "",
    params: s.params ?? null,
    humanOutputSchema: s.humanOutputSchema ?? null,
    humanRequiredArtifactKinds: s.humanRequiredArtifactKinds ?? [],
    paramsText: s.params == null ? "" : JSON.stringify(s.params, null, 1),
    paramsError: false,
    fixedMinutes: s.fixedMinutes === null ? "" : String(s.fixedMinutes),
    secondsPerUnit: s.secondsPerUnit === null ? "" : String(s.secondsPerUnit),
    optimistic: String(s.estimatedMinutesOptimistic),
    likely: String(s.estimatedMinutesLikely),
    conservative: String(s.estimatedMinutesConservative),
    aiCostCents: String(s.estimatedAiCostCents),
    toolUnits: String(s.estimatedToolUnits),
    verificationMethod: s.verificationMethod,
    acceptanceCriteria: s.acceptanceCriteria.join("\n"),
    riskLevel: s.riskLevel,
    riskNote: s.riskNote ?? "",
    dependsOn: s.dependsOnOrder.join(", "),
  };
}

const BLANK_STEP: EditableStep = {
  title: "",
  description: "",
  executor: "human",
  humanRole: "worker",
  tool: "",
  primitiveId: "",
  params: null,
  humanOutputSchema: null,
  humanRequiredArtifactKinds: [],
  paramsText: "",
  paramsError: false,
  fixedMinutes: "",
  secondsPerUnit: "",
  optimistic: "0",
  likely: "0",
  conservative: "0",
  aiCostCents: "0",
  toolUnits: "0",
  verificationMethod: "",
  acceptanceCriteria: "",
  riskLevel: "low",
  riskNote: "",
  dependsOn: "",
};

const lines = (v: string) =>
  v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export function PlanReview({ data }: { data: PlanReviewData }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [steps, setSteps] = useState<EditableStep[]>(
    () => data.version?.steps.map(toEditable) ?? []
  );
  const [deliverable, setDeliverable] = useState(data.version?.deliverableDescription ?? "");
  const [assumptions, setAssumptions] = useState((data.version?.assumptions ?? []).join("\n"));
  const [exclusions, setExclusions] = useState((data.version?.exclusions ?? []).join("\n"));
  const [editNote, setEditNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!data.classification && !data.version) return null;
  const v = data.version;

  function setStep(i: number, patch: Partial<EditableStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function save() {
    if (!v) return;
    // An invalid params JSON never leaves the browser: the compiler would
    // accept the save and silently hand the step to a person, which is the
    // one failure an editor must make loud rather than polite.
    const badParams = steps.findIndex((s) => s.paramsError && s.executor !== "human");
    if (badParams !== -1) {
      setError(`Step ${badParams + 1}: params is not valid JSON. Fix it or clear it before saving.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await editPlanVersion({
        taskId: data.taskId,
        baseVersionId: v.id,
        editNote: editNote || undefined,
        deliverableDescription: deliverable,
        assumptions: lines(assumptions),
        exclusions: lines(exclusions),
        steps: steps.map((s) => ({
          title: s.title,
          description: s.description,
          executor: s.executor,
          humanRole: s.executor === "human" ? (s.humanRole || "worker") : null,
          tool: s.tool || null,
          // A human step may never claim a primitive (the schema rejects it),
          // so demoting a step to human clears the primitive rather than
          // leaving a stale id behind for the compiler to trip over.
          primitiveId: s.executor === "human" ? null : (s.primitiveId || null),
          // A human step carries no capability, so it carries no params.
          params:
            s.executor === "human"
              ? null
              : ((s.params ?? null) as Record<string, unknown> | null),
          // Empty means "no decomposition", which the residual reads as a
          // signal to fall back to the full PERT estimate. Zero would mean
          // "this step genuinely costs nothing", which is a different claim.
          fixedMinutes: s.fixedMinutes === "" ? null : Number(s.fixedMinutes),
          secondsPerUnit: s.secondsPerUnit === "" ? null : Number(s.secondsPerUnit),
          estimatedMinutesOptimistic: Number(s.optimistic || 0),
          estimatedMinutesLikely: Number(s.likely || 0),
          estimatedMinutesConservative: Number(s.conservative || 0),
          estimatedAiCostCents: Number(s.aiCostCents || 0),
          estimatedToolUnits: Number(s.toolUnits || 0),
          /**
           * PASS-THROUGH, not an editable field. There is no input for the
           * human output contract in this form, but `admin-plan.ts` rebuilds
           * every step row from this payload — so omitting it here would wipe
           * the obligation on the next save. Carried verbatim so an edit to
           * some other field cannot quietly delete what the plan promised.
           */
          humanOutputSchema: (s.humanOutputSchema ?? null) as Record<string, unknown> | null,
          humanRequiredArtifactKinds: s.humanRequiredArtifactKinds ?? [],
          verificationMethod: s.verificationMethod,
          acceptanceCriteria: lines(s.acceptanceCriteria),
          riskLevel: s.riskLevel,
          riskNote: s.riskNote || null,
          dependsOnOrder: s.dependsOn
            .split(",")
            .map((n) => Number(n.trim()))
            .filter((n) => Number.isInteger(n) && n >= 1),
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      setEditNote("");
      router.refresh();
    });
  }

  return (
    <div className="mb-4 space-y-4">
      {/* ── Block A: understanding ── */}
      {data.classification ? (
        <Card>
          <CardBody>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <SectionLabel as="h2">What is being asked</SectionLabel>
              <span className="flex items-center gap-1.5">
                {data.classification.sensitiveData ? (
                  <Badge className="border-[#8C2F23]/40 bg-[#8C2F23]/10 text-[#8C2F23]">
                    Sensitive data
                  </Badge>
                ) : null}
                <Badge className="border-black/12 bg-black/[0.03] text-[#5B6069]">
                  {data.classification.quoteTier === "manual" ? "Manual review advised" : "Assisted quote"}
                </Badge>
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[#14161A]">{data.classification.objective}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[#14161A]/[0.06] pt-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-[#5B6069]">Deliverable</dt>
                <dd className="text-[#14161A]">{data.classification.deliverableFormat}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#5B6069]">Quantity read</dt>
                <dd className="font-mono tabular-nums text-[#14161A]">
                  {data.classification.quantityInterpreted ?? "?"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#5B6069]">Verification</dt>
                <dd className="text-[#14161A]">{data.classification.verificationLevel}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#5B6069]">Access needed</dt>
                <dd className="text-[#14161A]">
                  {data.classification.requiredAccess.length === 0
                    ? "None"
                    : data.classification.requiredAccess.join("; ")}
                </dd>
              </div>
            </dl>
            {/* LOT C: the intake framing — the four routing facts the planner
                received. Recurring and operator-decided formats are the two
                the firewall forces to manual, so they render as warnings. */}
            {data.classification.sourceShape ? (
              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[#14161A]/[0.06] pt-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-[#5B6069]">Source of units</dt>
                  <dd className="text-[#14161A]">
                    {SOURCE_SHAPE_LABELS[data.classification.sourceShape as SourceShape] ??
                      data.classification.sourceShape}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#5B6069]">Client expects</dt>
                  <dd className="text-[#14161A]">
                    {VERIFICATION_EXPECTATION_LABELS[
                      data.classification.verificationExpectation as VerificationExpectation
                    ] ?? data.classification.verificationExpectation}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#5B6069]">Output format</dt>
                  <dd
                    className={
                      data.classification.outputFormatCode === "other"
                        ? "font-medium text-[#955710]"
                        : "text-[#14161A]"
                    }
                  >
                    {OUTPUT_FORMAT_LABELS[
                      data.classification.outputFormatCode as OutputFormatCode
                    ] ?? data.classification.outputFormatCode}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#5B6069]">Recurrence</dt>
                  <dd
                    className={
                      data.classification.recurrence === "recurring"
                        ? "font-medium text-[#955710]"
                        : "text-[#14161A]"
                    }
                  >
                    {RECURRENCE_LABELS[data.classification.recurrence as Recurrence] ??
                      data.classification.recurrence}
                  </dd>
                </div>
              </dl>
            ) : null}
            {data.classification.missingInformation.length > 0 ? (
              <div className="mt-3 rounded-[4px] bg-[#D98324]/[0.08] px-3 py-2.5">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#955710]">
                  Still unanswered
                </p>
                <ul className="mt-1 list-disc pl-4 text-sm leading-relaxed text-[#14161A]">
                  {data.classification.missingInformation.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* ── Block B: the plan ── */}
      {v ? (
        <Card>
          <CardBody>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <SectionLabel as="h2">
                Execution plan · v{v.version} {v.source === "admin_edited" ? "(edited)" : "(AI draft)"}
              </SectionLabel>
              {!editing ? (
                <button
                  className="text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
                  onClick={() => setEditing(true)}
                >
                  Edit plan…
                </button>
              ) : null}
            </div>

            {v.critique ? (
              <div className="mb-3 rounded-[4px] border border-[#14161A]/[0.08] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
                    Adversarial critique
                  </p>
                  <Badge className={severityBadge(v.critique.severity)}>{v.critique.severity}</Badge>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-[#14161A]">
                  {v.critique.overallAssessment}
                </p>
                {[
                  ["Missing steps", v.critique.missingSteps],
                  ["Tool concerns", v.critique.wrongToolFlags],
                  ["Time risks", v.critique.timeRiskFlags],
                  ["Security risks", v.critique.securityRiskFlags],
                ]
                  .filter(([, items]) => (items as string[]).length > 0)
                  .map(([label, items]) => (
                    <div key={label as string} className="mt-2">
                      <p className="text-xs font-medium text-[#5B6069]">{label as string}</p>
                      <ul className="list-disc pl-4 text-sm leading-relaxed text-[#14161A]">
                        {(items as string[]).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            ) : null}

            {!editing ? (
              <>
                <ol className="divide-y divide-[#14161A]/[0.06]">
                  {v.steps.map((s) => (
                    <li key={s.order} className="py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-[#14161A]">
                          <span className="font-mono text-xs text-[#5B6069]">{s.order}.</span> {s.title}
                        </p>
                        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-[#5B6069]">
                          <span>{EXECUTOR_LABEL[s.executor]}{s.humanRole ? ` (${s.humanRole})` : ""}</span>
                          {/* The primitive is the difference between a step
                              the engine runs and one a person does. It is not
                              a detail: it is the whole execution contract. */}
                          {s.primitiveId ? (
                            <span className="text-[#166049]">· {s.primitiveId}</span>
                          ) : null}
                          {s.tool ? <span>· {s.tool}</span> : null}
                          <span className="tabular-nums">
                            · {s.estimatedMinutesLikely}m ({s.estimatedMinutesOptimistic}-{s.estimatedMinutesConservative})
                          </span>
                          {s.riskLevel !== "low" ? (
                            <span className={s.riskLevel === "high" ? "text-[#8C2F23]" : "text-[#955710]"}>
                              · {s.riskLevel} risk
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm leading-relaxed text-[#5B6069]">{s.description}</p>
                      <p className="mt-1 text-xs text-[#5B6069]">
                        <span className="font-medium">Check:</span> {s.verificationMethod}
                      </p>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 grid gap-3 border-t border-[#14161A]/[0.06] pt-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-[#5B6069]">Deliverable</p>
                    <p className="leading-relaxed text-[#14161A]">{v.deliverableDescription}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#5B6069]">Assumptions</p>
                    {v.assumptions.length === 0 ? (
                      <p className="text-[#5B6069]">None stated.</p>
                    ) : (
                      <ul className="list-disc pl-4 leading-relaxed text-[#14161A]">
                        {v.assumptions.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#5B6069]">Not included</p>
                    {v.exclusions.length === 0 ? (
                      <p className="text-[#5B6069]">None stated.</p>
                    ) : (
                      <ul className="list-disc pl-4 leading-relaxed text-[#14161A]">
                        {v.exclusions.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                {steps.map((s, i) => (
                  <div key={i} className="rounded-[4px] border border-[#14161A]/[0.08] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-xs text-[#5B6069]">Step {i + 1}</p>
                      <button
                        className="text-xs font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#8C2F23]"
                        onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <Field label="Title">
                        <input className={inputClass} value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} />
                      </Field>
                      <div className="grid grid-cols-3 gap-2">
                        <Field label="Executor">
                          <select className={inputClass} value={s.executor} onChange={(e) => setStep(i, { executor: e.target.value as EditableStep["executor"] })}>
                            {EXECUTORS.map((x) => (
                              <option key={x} value={x}>{EXECUTOR_LABEL[x]}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Role">
                          <select
                            className={inputClass}
                            value={s.humanRole}
                            disabled={s.executor !== "human"}
                            onChange={(e) => setStep(i, { humanRole: e.target.value as EditableStep["humanRole"] })}
                          >
                            <option value="">n/a</option>
                            {HUMAN_ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Tool">
                          <select className={inputClass} value={s.tool} onChange={(e) => setStep(i, { tool: e.target.value })}>
                            {TOOLS.map((t) => (
                              <option key={t} value={t}>{t || "none"}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </div>
                    <Field label="Description">
                      <textarea rows={2} className={inputClass} value={s.description} onChange={(e) => setStep(i, { description: e.target.value })} />
                    </Field>
                    {/*
                      The execution contract. The primitive is what decides
                      whether the engine runs this step or hands it to a
                      person, and the two decomposition fields are what the
                      residual payout is computed from. Editing a plan without
                      them would silently turn an automatable plan into an
                      entirely human one.
                    */}
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <Field label="Primitive (machine steps only)">
                        <select
                          className={inputClass}
                          value={s.primitiveId}
                          disabled={s.executor === "human"}
                          onChange={(e) => setStep(i, { primitiveId: e.target.value })}
                        >
                          <option value="">none (stays human)</option>
                          {PLAN_PRIMITIVE_IDS.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Fixed human min.">
                        <input
                          inputMode="numeric"
                          className={inputClass}
                          placeholder="blank = use PERT"
                          disabled={s.executor !== "human"}
                          value={s.fixedMinutes}
                          onChange={(e) => setStep(i, { fixedMinutes: e.target.value.replace(/\D/g, "") })}
                        />
                      </Field>
                      <Field label="Human sec. per unit">
                        <input
                          inputMode="numeric"
                          className={inputClass}
                          placeholder="blank = use PERT"
                          disabled={s.executor !== "human"}
                          value={s.secondsPerUnit}
                          onChange={(e) => setStep(i, { secondsPerUnit: e.target.value.replace(/\D/g, "") })}
                        />
                      </Field>
                    </div>
                    {/*
                      LOT A: the capability's parameters, editable at last.
                      For a file-reading primitive the fileId is a SELECTION
                      from the task's own attachments — an operator never
                      types a database id, and the server action re-verifies
                      ownership on save regardless. Every other primitive
                      gets the raw JSON with a loud parse guard: an invalid
                      configuration must block Save here, because downstream
                      it would "succeed" into a silently human step.
                    */}
                    {s.executor !== "human" && s.primitiveId !== "" ? (
                      primitiveReadsFiles(s.primitiveId) ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <Field label="Attachment (fileId)">
                            <select
                              className={inputClass}
                              value={
                                typeof (s.params as Record<string, unknown> | null)?.fileId === "string"
                                  ? String((s.params as Record<string, unknown>).fileId)
                                  : ""
                              }
                              onChange={(e) => {
                                const base =
                                  s.params && typeof s.params === "object"
                                    ? { ...(s.params as Record<string, unknown>) }
                                    : {};
                                if (e.target.value === "") delete base.fileId;
                                else base.fileId = e.target.value;
                                setStep(i, {
                                  params: base,
                                  paramsText: JSON.stringify(base, null, 1),
                                  paramsError: false,
                                });
                              }}
                            >
                              <option value="">choose an attachment…</option>
                              {data.attachments.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.fileName} ({Math.max(1, Math.round(f.sizeBytes / 1024))} KB)
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Dataset name">
                            <input
                              className={inputClass}
                              placeholder="main"
                              value={String(
                                (s.params as Record<string, unknown> | null)?.datasetName ?? ""
                              )}
                              onChange={(e) => {
                                const base =
                                  s.params && typeof s.params === "object"
                                    ? { ...(s.params as Record<string, unknown>) }
                                    : {};
                                if (e.target.value === "") delete base.datasetName;
                                else base.datasetName = e.target.value;
                                setStep(i, {
                                  params: base,
                                  paramsText: JSON.stringify(base, null, 1),
                                  paramsError: false,
                                });
                              }}
                            />
                          </Field>
                          <Field label="Key column (blank = row number)">
                            <input
                              className={inputClass}
                              value={String(
                                (s.params as Record<string, unknown> | null)?.keyColumn ?? ""
                              )}
                              onChange={(e) => {
                                const base =
                                  s.params && typeof s.params === "object"
                                    ? { ...(s.params as Record<string, unknown>) }
                                    : {};
                                if (e.target.value === "") delete base.keyColumn;
                                else base.keyColumn = e.target.value;
                                setStep(i, {
                                  params: base,
                                  paramsText: JSON.stringify(base, null, 1),
                                  paramsError: false,
                                });
                              }}
                            />
                          </Field>
                        </div>
                      ) : (
                        <Field label={`Params JSON${s.paramsError ? " — INVALID, fix before saving" : ""}`}>
                          <textarea
                            rows={3}
                            className={`${inputClass} font-mono text-xs ${s.paramsError ? "border-[#8C2F23]" : ""}`}
                            placeholder='{} — the primitive&apos;s configuration; invalid params make the step a person&apos;s'
                            value={s.paramsText}
                            onChange={(e) => {
                              const text = e.target.value;
                              if (text.trim() === "") {
                                setStep(i, { paramsText: text, params: null, paramsError: false });
                                return;
                              }
                              try {
                                const parsed: unknown = JSON.parse(text);
                                setStep(i, { paramsText: text, params: parsed, paramsError: false });
                              } catch {
                                setStep(i, { paramsText: text, paramsError: true });
                              }
                            }}
                          />
                        </Field>
                      )
                    ) : null}
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                      <Field label="Min (opt.)">
                        <input inputMode="numeric" className={inputClass} value={s.optimistic} onChange={(e) => setStep(i, { optimistic: e.target.value.replace(/\D/g, "") })} />
                      </Field>
                      <Field label="Min (likely)">
                        <input inputMode="numeric" className={inputClass} value={s.likely} onChange={(e) => setStep(i, { likely: e.target.value.replace(/\D/g, "") })} />
                      </Field>
                      <Field label="Min (cons.)">
                        <input inputMode="numeric" className={inputClass} value={s.conservative} onChange={(e) => setStep(i, { conservative: e.target.value.replace(/\D/g, "") })} />
                      </Field>
                      <Field label="AI cost (¢)">
                        <input inputMode="numeric" className={inputClass} value={s.aiCostCents} onChange={(e) => setStep(i, { aiCostCents: e.target.value.replace(/\D/g, "") })} />
                      </Field>
                      <Field label="Tool units">
                        <input inputMode="numeric" className={inputClass} value={s.toolUnits} onChange={(e) => setStep(i, { toolUnits: e.target.value.replace(/\D/g, "") })} />
                      </Field>
                    </div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <Field label="Verification method">
                        <input className={inputClass} value={s.verificationMethod} onChange={(e) => setStep(i, { verificationMethod: e.target.value })} />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Risk">
                          <select className={inputClass} value={s.riskLevel} onChange={(e) => setStep(i, { riskLevel: e.target.value as EditableStep["riskLevel"] })}>
                            {RISKS.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Depends on (orders)">
                          <input className={inputClass} placeholder="e.g. 1, 2" value={s.dependsOn} onChange={(e) => setStep(i, { dependsOn: e.target.value })} />
                        </Field>
                      </div>
                    </div>
                    <Field label="Acceptance criteria (one per line)">
                      <textarea rows={2} className={inputClass} value={s.acceptanceCriteria} onChange={(e) => setStep(i, { acceptanceCriteria: e.target.value })} />
                    </Field>
                  </div>
                ))}
                <button
                  className="text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
                  onClick={() => setSteps((prev) => [...prev, { ...BLANK_STEP }])}
                >
                  + Add step
                </button>

                <div className="grid gap-3 border-t border-[#14161A]/[0.06] pt-3 sm:grid-cols-3">
                  <Field label="Deliverable (client may see this)">
                    <textarea rows={2} className={inputClass} value={deliverable} onChange={(e) => setDeliverable(e.target.value)} />
                  </Field>
                  <Field label="Assumptions (one per line, client may see)">
                    <textarea rows={2} className={inputClass} value={assumptions} onChange={(e) => setAssumptions(e.target.value)} />
                  </Field>
                  <Field label="Not included (one per line, client may see)">
                    <textarea rows={2} className={inputClass} value={exclusions} onChange={(e) => setExclusions(e.target.value)} />
                  </Field>
                </div>
                <Field label="Edit note (internal, on the version record)">
                  <input className={inputClass} placeholder="Why this change" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                </Field>

                {error ? (
                  <p role="alert" className="text-sm text-[#8C2F23]">{error}</p>
                ) : null}

                <div className="flex items-center gap-3">
                  <button className={buttonPrimary} disabled={isPending || steps.length === 0} onClick={save}>
                    {isPending ? "Saving…" : `Save as v${v.version + 1} & re-price`}
                  </button>
                  <button
                    className="px-2 text-sm text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
                    onClick={() => {
                      setEditing(false);
                      setError(null);
                      setSteps(v.steps.map(toEditable));
                      setDeliverable(v.deliverableDescription);
                      setAssumptions(v.assumptions.join("\n"));
                      setExclusions(v.exclusions.join("\n"));
                    }}
                  >
                    Discard changes
                  </button>
                  <span className="text-xs text-[#5B6069]">
                    Saving creates a new version. Nothing is overwritten.
                  </span>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}

      {/* ── Block C: the estimate ── */}
      {v ? (
        <Card className="border-[#955710]/30">
          <CardBody>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <SectionLabel as="h2">Deterministic estimate</SectionLabel>
              <Badge className="border-[#955710]/40 bg-[#D98324]/10 text-[#955710]">
                {v.calibration === "uncalibrated" ? "Uncalibrated" : v.calibration}
              </Badge>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[#5B6069]">
              Computed by code from the plan&apos;s resource estimates and the internal cost
              catalog. No real mandate has been measured against these rates yet: treat every
              figure as a starting point for your judgment, not a truth.
            </p>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-[#5B6069]">Internal cost (likely)</dt>
                <dd className="font-mono tabular-nums text-[#14161A]">{usd(v.internalCostLikelyCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#5B6069]">Internal cost (conservative)</dt>
                <dd className="font-mono tabular-nums text-[#14161A]">{usd(v.internalCostConservativeCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#5B6069]">Suggested client price</dt>
                <dd className={`font-medium ${moneyClient}`}>{usd(v.suggestedPriceCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#5B6069]">Suggested worker payout</dt>
                <dd className={`font-medium ${moneyPayout}`}>{usd(v.suggestedVaPayoutCents)}</dd>
              </div>
            </dl>
            {data.history.length > 1 ? (
              <div className="mt-3 border-t border-[#14161A]/[0.06] pt-3">
                <p className="mb-1 text-xs font-medium text-[#5B6069]">Version history</p>
                <ul className="space-y-0.5 font-mono text-xs tabular-nums text-[#5B6069]">
                  {data.history.map((h) => (
                    <li key={h.version}>
                      v{h.version} · {h.source === "ai_generated" ? "AI" : "admin"} ·{" "}
                      {usd(h.suggestedPriceCents)} / {usd(h.suggestedVaPayoutCents)}
                      {h.editNote ? ` · ${h.editNote}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
