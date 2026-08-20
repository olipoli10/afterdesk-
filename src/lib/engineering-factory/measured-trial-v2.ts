import { createHash } from "node:crypto";

import {
  createFocusedCandidatePacket,
  packetsAreEquivalent,
  type BakeoffParticipant,
  type CandidatePacket,
} from "@/lib/engineering-factory/bakeoff";
import type { DevBenchCatalog } from "@/lib/engineering-factory/devbench";
import { validateFocusedDevBenchRun, type DevBenchRun } from "@/lib/engineering-factory/devbench-run";
import {
  captureMeasuredRun,
  persistMeasuredRun,
  type MeasuredRunEvidence,
} from "@/lib/engineering-factory/measured-run";

const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const SAFE_DESCRIPTOR = /^[A-Za-z0-9][A-Za-z0-9._:/+ -]{0,120}$/;
const FORBIDDEN_DESCRIPTOR_FRAGMENT = /(?:api[_-]?key|bearer|secret|token|prompt|output)/i;
const FROZEN_COMMIT = /^[0-9a-f]{40}$/i;

export const DRY_RUN_INTERVENTION_RULE =
  "Count every evaluator action that changes candidate input, scope, environment or result; ordinary start, stop and observation do not count.";

export type DryRunTrialCandidate = {
  participant: BakeoffParticipant;
  label: string;
  modelLabel: string;
  harnessLabel: string;
  reasoningEffort: DevBenchRun["candidate"]["reasoningEffort"];
  /** Subscription/quota trials do not support a cost ranking. */
  costSource: "unavailable";
};

export type DryRunCaseSeedMap = Readonly<Record<string, string>>;

export type DryRunTrialSlot = {
  pass: 1 | 2 | 3 | 4;
  position: number;
  participant: BakeoffParticipant;
  candidateLabel: string;
  caseId: string;
  startingCommit: string;
  packetFingerprint: string;
};

export type DryRunTrialPlan = {
  schemaVersion: 2;
  catalogName: string;
  catalogVersion: 1;
  caseSeeds: DryRunCaseSeedMap;
  casePacketFingerprints: Readonly<Record<string, string>>;
  interventionRule: typeof DRY_RUN_INTERVENTION_RULE;
  costComparison: "unavailable-by-design";
  candidates: readonly DryRunTrialCandidate[];
  schedule: readonly DryRunTrialSlot[];
};

export class DryRunTrialRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DryRunTrialRefusal";
  }
}

function fingerprint(packet: CandidatePacket): string {
  const comparable = { ...packet, participant: undefined };
  return createHash("sha256").update(JSON.stringify(comparable), "utf8").digest("hex");
}

function assertSafeDescriptor(value: string, field: string): void {
  if (!SAFE_DESCRIPTOR.test(value) || FORBIDDEN_DESCRIPTOR_FRAGMENT.test(value)) {
    throw new DryRunTrialRefusal(`${field} must be a safe descriptor`);
  }
}

function assertCandidate(candidate: DryRunTrialCandidate): void {
  if (!SAFE_LABEL.test(candidate.label)) throw new DryRunTrialRefusal("candidate.label must be a safe label");
  assertSafeDescriptor(candidate.modelLabel, "candidate.modelLabel");
  assertSafeDescriptor(candidate.harnessLabel, "candidate.harnessLabel");
  if (candidate.costSource !== "unavailable") {
    throw new DryRunTrialRefusal("dry-run cost must remain explicitly unavailable");
  }
}

function candidateFingerprint(candidate: DryRunTrialCandidate): string {
  return JSON.stringify({
    label: candidate.label,
    modelLabel: candidate.modelLabel,
    harnessLabel: candidate.harnessLabel,
    reasoningEffort: candidate.reasoningEffort,
    costSource: candidate.costSource,
  });
}

function assertCandidates(candidates: readonly DryRunTrialCandidate[]): [DryRunTrialCandidate, DryRunTrialCandidate] {
  if (candidates.length !== 2) throw new DryRunTrialRefusal("a dry-run trial requires exactly two candidates");
  const [first, second] = candidates;
  if (!first || !second) throw new DryRunTrialRefusal("a dry-run trial requires exactly two candidates");
  assertCandidate(first);
  assertCandidate(second);
  if (first.participant === second.participant) throw new DryRunTrialRefusal("trial participants must be distinct");
  if (candidateFingerprint(first) === candidateFingerprint(second)) {
    throw new DryRunTrialRefusal("candidates must differ in at least one declared configuration field");
  }
  return [first, second];
}

function assertCaseSeeds(catalog: DevBenchCatalog, caseSeeds: DryRunCaseSeedMap): void {
  const expected = catalog.cases.map((benchCase) => benchCase.id).sort();
  const observed = Object.keys(caseSeeds).sort();
  const allExpected = expected.length === observed.length && expected.every((caseId, index) => caseId === observed[index]);
  const commits = observed.map((caseId) => caseSeeds[caseId]);
  if (!allExpected || commits.some((commit) => typeof commit !== "string" || !FROZEN_COMMIT.test(commit)) || new Set(commits).size !== commits.length) {
    throw new DryRunTrialRefusal("caseSeeds must contain one distinct frozen commit per catalog case");
  }
}

function assertFocusedPackets(catalog: DevBenchCatalog, first: DryRunTrialCandidate, second: DryRunTrialCandidate) {
  const fingerprints: Record<string, string> = {};
  for (const benchCase of catalog.cases) {
    const firstPacket = createFocusedCandidatePacket(catalog, first.participant, benchCase.id);
    const secondPacket = createFocusedCandidatePacket(catalog, second.participant, benchCase.id);
    if (!packetsAreEquivalent(firstPacket, secondPacket)) {
      throw new DryRunTrialRefusal(`candidate packets are not equivalent for ${benchCase.id}`);
    }
    fingerprints[benchCase.id] = fingerprint(firstPacket);
  }
  return fingerprints;
}

/**
 * Builds a local-only, time-only four-pass comparison. Every case retains its
 * own historical frozen seed; the plan never invokes a candidate or provider.
 */
export function createDryRunTrialPlan({
  catalog,
  caseSeeds,
  candidates,
}: {
  catalog: DevBenchCatalog;
  caseSeeds: DryRunCaseSeedMap;
  candidates: readonly DryRunTrialCandidate[];
}): DryRunTrialPlan {
  assertCaseSeeds(catalog, caseSeeds);
  const [first, second] = assertCandidates(candidates);
  const casePacketFingerprints = assertFocusedPackets(catalog, first, second);
  const participantForPass: Record<1 | 2 | 3 | 4, DryRunTrialCandidate> = {
    1: first,
    2: second,
    3: second,
    4: first,
  };

  const schedule: DryRunTrialSlot[] = [];
  for (const pass of [1, 2, 3, 4] as const) {
    const candidate = participantForPass[pass];
    for (const [index, benchCase] of catalog.cases.entries()) {
      schedule.push({
        pass,
        position: index + 1,
        participant: candidate.participant,
        candidateLabel: candidate.label,
        caseId: benchCase.id,
        startingCommit: caseSeeds[benchCase.id]!,
        packetFingerprint: casePacketFingerprints[benchCase.id]!,
      });
    }
  }

  return {
    schemaVersion: 2,
    catalogName: catalog.name,
    catalogVersion: catalog.version,
    caseSeeds: { ...caseSeeds },
    casePacketFingerprints,
    interventionRule: DRY_RUN_INTERVENTION_RULE,
    costComparison: "unavailable-by-design",
    candidates: [first, second],
    schedule,
  };
}

/**
 * Rejects drift before a focused, time-only result can be kept as dry-run
 * evidence. It intentionally cannot produce a cost rank or adoption decision.
 */
export function assertRunMatchesDryRunTrial({
  plan,
  slot,
  run,
  catalog,
}: {
  plan: DryRunTrialPlan;
  slot: DryRunTrialSlot;
  run: DevBenchRun;
  catalog: DevBenchCatalog;
}): void {
  const plannedSlot = plan.schedule.find(
    (candidate) =>
      candidate.pass === slot.pass &&
      candidate.position === slot.position &&
      candidate.participant === slot.participant &&
      candidate.candidateLabel === slot.candidateLabel &&
      candidate.caseId === slot.caseId &&
      candidate.startingCommit === slot.startingCommit &&
      candidate.packetFingerprint === slot.packetFingerprint
  );
  if (!plannedSlot) throw new DryRunTrialRefusal("run slot is not in the frozen dry-run plan");
  if (catalog.name !== plan.catalogName || catalog.version !== plan.catalogVersion) {
    throw new DryRunTrialRefusal("catalog differs from the frozen dry-run plan");
  }
  if (run.startingCommit !== plannedSlot.startingCommit) {
    throw new DryRunTrialRefusal("startingCommit differs from the frozen case seed");
  }

  const candidate = plan.candidates.find(
    (candidate) => candidate.participant === plannedSlot.participant && candidate.label === plannedSlot.candidateLabel
  );
  if (!candidate) throw new DryRunTrialRefusal("planned candidate is missing");
  for (const [field, value] of Object.entries({
    label: candidate.label,
    modelLabel: candidate.modelLabel,
    harnessLabel: candidate.harnessLabel,
    reasoningEffort: candidate.reasoningEffort,
    contextMode: "sanitized-frozen-checkout",
    networkAccess: "none",
  })) {
    if (run.candidate[field as keyof typeof run.candidate] !== value) {
      throw new DryRunTrialRefusal(`candidate.${field} differs from the frozen dry-run plan`);
    }
  }
  if (run.measurements.costSource !== "unavailable" || run.measurements.costCents !== null) {
    throw new DryRunTrialRefusal("dry-run cost must remain explicitly unavailable");
  }

  const report = validateFocusedDevBenchRun(run, catalog, plannedSlot.caseId);
  if (!report.ok) throw new DryRunTrialRefusal(report.errors.join("; "));
  if (!report.measurementReadiness.elapsedComparable) {
    throw new DryRunTrialRefusal("run lacks comparable evaluator time");
  }
}

/**
 * Captures one frozen V2 slot with evaluator-owned time. The callback receives
 * no secrets or provider protocol; it returns only the privacy-checked result
 * evidence permitted by the existing measured-run envelope.
 */
export async function captureDryRunTrialSlot({
  plan,
  slot,
  runId,
  humanInterventions,
  catalog,
  capture,
  monotonicNow,
}: {
  plan: DryRunTrialPlan;
  slot: DryRunTrialSlot;
  runId: string;
  humanInterventions: number;
  catalog: DevBenchCatalog;
  capture: () => Promise<MeasuredRunEvidence & Record<string, unknown>>;
  monotonicNow?: () => bigint;
}): Promise<DevBenchRun> {
  const candidate = plan.candidates.find(
    (candidate) => candidate.participant === slot.participant && candidate.label === slot.candidateLabel
  );
  if (!candidate) throw new DryRunTrialRefusal("planned candidate is missing");
  const run = await captureMeasuredRun({
    declaration: {
      schemaVersion: 1,
      runId,
      catalogVersion: plan.catalogVersion,
      startingCommit: slot.startingCommit,
      candidate: {
        label: candidate.label,
        modelLabel: candidate.modelLabel,
        harnessLabel: candidate.harnessLabel,
        reasoningEffort: candidate.reasoningEffort,
        contextMode: "sanitized-frozen-checkout",
        networkAccess: "none",
      },
      measurements: { costCents: null, costSource: "unavailable", humanInterventions },
    },
    catalog,
    expectedCaseIds: [slot.caseId],
    capture,
    monotonicNow,
  });
  assertRunMatchesDryRunTrial({ plan, slot, run, catalog });
  return run;
}

/** Persists one already-validated focused slot with create-only semantics. */
export async function persistDryRunTrialSlot({
  plan,
  slot,
  run,
  catalog,
  directory,
}: {
  plan: DryRunTrialPlan;
  slot: DryRunTrialSlot;
  run: DevBenchRun;
  catalog: DevBenchCatalog;
  directory?: string;
}): Promise<string> {
  assertRunMatchesDryRunTrial({ plan, slot, run, catalog });
  return persistMeasuredRun({ run, catalog, directory, expectedCaseIds: [slot.caseId] });
}
