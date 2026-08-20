import { describe, expect, it } from "vitest";

import { DEV_BENCH_V1 } from "@/lib/engineering-factory/catalog";
import {
  createCandidatePacket,
  packetsAreEquivalent,
  scoreDevBenchRun,
} from "@/lib/engineering-factory/bakeoff";
import type { DevBenchRun } from "@/lib/engineering-factory/devbench-run";

const COMPLETE_RUN: DevBenchRun = {
  schemaVersion: 1,
  runId: "candidate-a-run-01",
  catalogVersion: 1,
  startingCommit: "74a5bf5cbed970d12a7b4b6498052647083051e3",
  candidate: {
    label: "candidate-a",
    modelLabel: "declared by evaluator",
    harnessLabel: "declared by evaluator",
    reasoningEffort: "high",
    contextMode: "sanitized-frozen-checkout",
    networkAccess: "none",
  },
  measurements: { elapsedSeconds: 600, costCents: 92, humanInterventions: 1 },
  outcomes: DEV_BENCH_V1.cases.map((benchCase) => ({
    caseId: benchCase.id,
    oracle: "pass",
    mutation: "caught-and-restored",
    scope: "pass",
    commands: benchCase.commands.map((command) => ({ command, exitCode: 0 })),
  })),
  reviewerVerdict: "accepted",
};

describe("Engineering Factory bake-off protocol", () => {
  it("gives Codex and Claude the same frozen task package", () => {
    const codex = createCandidatePacket(DEV_BENCH_V1, "Codex");
    const claude = createCandidatePacket(DEV_BENCH_V1, "Claude");

    expect(codex.participant).toBe("Codex");
    expect(claude.participant).toBe("Claude");
    expect(packetsAreEquivalent(codex, claude)).toBe(true);
    expect(codex.rules).toContain("No provider call, network access, secret access, deployment or database mutation.");
    expect(codex.cases).toHaveLength(8);
  });

  it("scores only a complete accepted record", () => {
    const scorecard = scoreDevBenchRun(COMPLETE_RUN, DEV_BENCH_V1);

    expect(scorecard.comparable, scorecard.blockers.join("\n")).toBe(true);
    expect(scorecard.acceptedCases).toBe(8);
    expect(scorecard.costPerAcceptedCaseCents).toBe(11.5);
  });

  it("mutation bakeoff-rejected-review cannot win on speed or cost", () => {
    const scorecard = scoreDevBenchRun(
      {
        ...COMPLETE_RUN,
        reviewerVerdict: "rejected",
        measurements: { elapsedSeconds: 1, costCents: 0, humanInterventions: 0 },
      },
      DEV_BENCH_V1
    );

    expect(scorecard.comparable).toBe(false);
    expect(scorecard.blockers).toContain("reviewerVerdict must be accepted");
    expect(scorecard.costPerAcceptedCaseCents).toBeNull();
  });

  it("mutation bakeoff-mismatched-packet is caught", () => {
    const packet = createCandidatePacket(DEV_BENCH_V1, "Codex");
    const altered = { ...packet, cases: packet.cases.slice(1) };

    expect(packetsAreEquivalent(altered, createCandidatePacket(DEV_BENCH_V1, "Claude"))).toBe(false);
  });
});
