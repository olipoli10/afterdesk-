import { createHash } from "node:crypto";

import {
  createCandidatePacket,
  packetsAreEquivalent,
  type BakeoffParticipant,
  type CandidatePacket,
} from "@/lib/engineering-factory/bakeoff";
import type { DevBenchCatalog } from "@/lib/engineering-factory/devbench";
import { validateDevBenchRun, type DevBenchRun } from "@/lib/engineering-factory/devbench-run";

type SupportedCostSource = "harness-meter" | "provider-billing-export";

const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const SAFE_DESCRIPTOR = /^[A-Za-z0-9][A-Za-z0-9._:/+ -]{0,120}$/;
const FORBIDDEN_DESCRIPTOR_FRAGMENT = /(?:api[_-]?key|bearer|secret|token|prompt|output)/i;

export const MEASURED_TRIAL_INTERVENTION_RULE =
  "Count every evaluator action that changes candidate input, scope, environment or result; ordinary start, stop and observation do not count.";

export type MeasuredTrialCandidate = {
  participant: BakeoffParticipant;
  label: string;
  modelLabel: string;
  harnessLabel: string;
  reasoningEffort: DevBenchRun["candidate"]["reasoningEffort"];
  costSource: SupportedCostSource;
};

export type MeasuredTrialSlot = {
  round: 1 | 2;
  position: 1 | 2;
  participant: BakeoffParticipant;
  candidateLabel: string;
};

export type MeasuredTrialPlan = {
  schemaVersion: 1;
  catalogName: string;
  catalogVersion: 1;
  startingCommit: string;
  caseIds: readonly string[];
  packetFingerprint: string;
  interventionRule: typeof MEASURED_TRIAL_INTERVENTION_RULE;
  candidates: readonly MeasuredTrialCandidate[];
  schedule: readonly MeasuredTrialSlot[];
};

export class MeasuredTrialRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeasuredTrialRefusal";
  }
}

function packetFingerprint(packet: CandidatePacket): string {
  const equalPacket = { ...packet, participant: undefined };
  return createHash("sha256").update(JSON.stringify(equalPacket), "utf8").digest("hex");
}

function assertSafeDescriptor(value: string, field: string): void {
  if (!SAFE_DESCRIPTOR.test(value) || FORBIDDEN_DESCRIPTOR_FRAGMENT.test(value)) {
    throw new MeasuredTrialRefusal(`${field} must be a safe descriptor`);
  }
}

function assertCandidate(candidate: MeasuredTrialCandidate): void {
  if (!SAFE_LABEL.test(candidate.label)) {
    throw new MeasuredTrialRefusal("candidate.label must be a safe label");
  }
  assertSafeDescriptor(candidate.modelLabel, "candidate.modelLabel");
  assertSafeDescriptor(candidate.harnessLabel, "candidate.harnessLabel");
  if (candidate.costSource !== "harness-meter" && candidate.costSource !== "provider-billing-export") {
    throw new MeasuredTrialRefusal("candidate must declare a supported cost source");
  }
}

function candidateFingerprint(candidate: MeasuredTrialCandidate): string {
  return JSON.stringify({
    label: candidate.label,
    modelLabel: candidate.modelLabel,
    harnessLabel: candidate.harnessLabel,
    reasoningEffort: candidate.reasoningEffort,
    costSource: candidate.costSource,
  });
}

function assertStartingCommit(startingCommit: string): void {
  if (!/^[0-9a-f]{40}$/i.test(startingCommit)) {
    throw new MeasuredTrialRefusal("startingCommit must be a frozen 40-character git commit");
  }
}

/**
 * Creates a local execution plan only. It does not invoke a model, harness,
 * provider, network request or external meter. Each candidate receives the
 * same packet twice in counterbalanced order to reduce first-run bias.
 */
export function createMeasuredTrialPlan({
  catalog,
  startingCommit,
  candidates,
}: {
  catalog: DevBenchCatalog;
  startingCommit: string;
  candidates: readonly MeasuredTrialCandidate[];
}): MeasuredTrialPlan {
  assertStartingCommit(startingCommit);
  if (candidates.length !== 2) {
    throw new MeasuredTrialRefusal("a measured trial requires exactly two candidates");
  }

  const [first, second] = candidates;
  if (!first || !second) throw new MeasuredTrialRefusal("a measured trial requires exactly two candidates");
  assertCandidate(first);
  assertCandidate(second);
  if (first.participant === second.participant) {
    throw new MeasuredTrialRefusal("trial participants must be distinct");
  }
  if (candidateFingerprint(first) === candidateFingerprint(second)) {
    throw new MeasuredTrialRefusal("candidates must differ in at least one declared configuration field");
  }

  const firstPacket = createCandidatePacket(catalog, first.participant);
  const secondPacket = createCandidatePacket(catalog, second.participant);
  if (!packetsAreEquivalent(firstPacket, secondPacket)) {
    throw new MeasuredTrialRefusal("candidate packets are not equivalent");
  }

  return {
    schemaVersion: 1,
    catalogName: catalog.name,
    catalogVersion: catalog.version,
    startingCommit,
    caseIds: catalog.cases.map((benchCase) => benchCase.id),
    packetFingerprint: packetFingerprint(firstPacket),
    interventionRule: MEASURED_TRIAL_INTERVENTION_RULE,
    candidates: [first, second],
    schedule: [
      { round: 1, position: 1, participant: first.participant, candidateLabel: first.label },
      { round: 1, position: 2, participant: second.participant, candidateLabel: second.label },
      { round: 2, position: 1, participant: second.participant, candidateLabel: second.label },
      { round: 2, position: 2, participant: first.participant, candidateLabel: first.label },
    ],
  };
}

/**
 * Rejects a run that drifts from the evaluator-approved plan before a
 * scorecard can rank it. The caller remains responsible for process isolation
 * and metering; this is a metadata and evidence gate only.
 */
export function assertRunMatchesMeasuredTrial({
  plan,
  slot,
  run,
  catalog,
}: {
  plan: MeasuredTrialPlan;
  slot: MeasuredTrialSlot;
  run: DevBenchRun;
  catalog: DevBenchCatalog;
}): void {
  const plannedSlot = plan.schedule.find(
    (candidate) =>
      candidate.round === slot.round &&
      candidate.position === slot.position &&
      candidate.participant === slot.participant &&
      candidate.candidateLabel === slot.candidateLabel
  );
  if (!plannedSlot) throw new MeasuredTrialRefusal("run slot is not in the frozen trial plan");
  if (catalog.name !== plan.catalogName || catalog.version !== plan.catalogVersion) {
    throw new MeasuredTrialRefusal("catalog differs from the frozen trial plan");
  }
  if (run.startingCommit !== plan.startingCommit) {
    throw new MeasuredTrialRefusal("startingCommit differs from the frozen trial plan");
  }

  const candidate = plan.candidates.find(
    (candidate) => candidate.participant === plannedSlot.participant && candidate.label === plannedSlot.candidateLabel
  );
  if (!candidate) throw new MeasuredTrialRefusal("planned candidate is missing");

  const expected = {
    label: candidate.label,
    modelLabel: candidate.modelLabel,
    harnessLabel: candidate.harnessLabel,
    reasoningEffort: candidate.reasoningEffort,
    contextMode: "sanitized-frozen-checkout" as const,
    networkAccess: "none" as const,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (run.candidate[field as keyof typeof expected] !== value) {
      throw new MeasuredTrialRefusal(`candidate.${field} differs from the frozen trial plan`);
    }
  }
  if (run.measurements.costSource !== candidate.costSource) {
    throw new MeasuredTrialRefusal("measurements.costSource differs from the frozen trial plan");
  }

  const report = validateDevBenchRun(run, catalog, plan.caseIds);
  if (!report.ok) throw new MeasuredTrialRefusal(report.errors.join("; "));
  if (!report.measurementReadiness.elapsedComparable || !report.measurementReadiness.costComparable) {
    throw new MeasuredTrialRefusal("run lacks comparable evaluator time or supported cost evidence");
  }
}
