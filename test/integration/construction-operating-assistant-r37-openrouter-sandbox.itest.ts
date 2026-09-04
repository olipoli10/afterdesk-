import { describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { R37_CASES } from "@/lib/construction-operating-assistant-r37/cases";
import { R37_MODELS, r37Fingerprint, type ControllerOutput } from "@/lib/construction-operating-assistant-r37/contracts";
import { runR37OpenRouterCampaign } from "@/server/construction-operating-assistant-r37/campaign";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";

async function context(label: string) {
  const owner = await prisma.user.create({
    data: { name: `R37 ${label} owner`, email: `r37-${label}-owner@example.invalid`, role: "CLIENT", emailVerified: true },
  });
  const admin = await prisma.user.create({
    data: { name: `R37 ${label} admin`, email: `r37-${label}-admin@example.invalid`, role: "ADMIN", emailVerified: true },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R37 ${label}` });
  return { ownerId: owner.id, adminId: admin.id, workspaceId: workspace.workspaceId };
}

function outputFor(caseId: (typeof R37_CASES)[number]["caseId"]): ControllerOutput {
  if (caseId === "INVOICE_READINESS") return {
    answer: "The file is not ready to invoice because written approval and a work photo are missing.",
    citedFactIds: ["F-101", "F-102", "F-103"],
    proposedCapability: "CLARIFY",
    limitations: ["No external action was performed."],
  };
  if (caseId === "MAINTAINED_STATE") return {
    answer: "September 8 and September 11 remain contradictory; Olivier is the next responsible human.",
    citedFactIds: ["F-201", "F-202", "F-203"],
    proposedCapability: "ANSWER_FROM_STATE",
    limitations: ["The contradiction unresolved state is preserved."],
  };
  return {
    answer: "Marc, please provide the missing work photo for project LAVAL-001.",
    citedFactIds: ["F-301", "F-302", "F-303"],
    proposedCapability: "PREPARE_COMMUNICATION",
    limitations: ["Prepared unsent; no external action was performed."],
  };
}

function transport() {
  return vi.fn(async ({ modelId, observedCase }: { modelId: (typeof R37_MODELS)[number]; observedCase: (typeof R37_CASES)[number] }) => {
    const core = {
      responseId: `response-${modelId}-${observedCase.caseId}`,
      modelId,
      output: outputFor(observedCase.caseId),
      usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
      costMicros: "1000",
      latencyMs: 10,
      evidenceLabel: "OBSERVED_PROVIDER_SYNTHETIC_INPUT" as const,
    };
    return { ...core, costMicros: 1_000n, responseFingerprint: r37Fingerprint(core) };
  });
}

describe("R37 OpenRouter durable campaign on disposable PostgreSQL", () => {
  it("runs the exact matrix once, settles cost, revokes grants and disables the lane", async () => {
    const ctx = await context("complete");
    const provider = transport();
    const evidenceWriter = vi.fn(async () => undefined);
    const report = await runR37OpenRouterCampaign({
      ...ctx,
      campaignId: "r37-openrouter-observed-v1",
      transport: provider,
      writeAttemptEvidence: evidenceWriter,
      now: () => new Date("2026-09-04T12:00:00.000Z"),
    });
    expect(report).toMatchObject({
      verdict: "OPENROUTER_SANDBOX_OBSERVED_PASS",
      expectedCallCount: 6,
      dispatchedCallCount: 6,
      settledSpendMicros: "6000",
      replayedDispatchCount: 0,
      providerLaneDisabled: true,
      grantsRevoked: true,
    });
    expect(provider).toHaveBeenCalledTimes(6);
    expect(evidenceWriter).toHaveBeenCalledTimes(6);
    expect(await prisma.providerSpendAttempt.count({ where: { workspaceId: ctx.workspaceId } })).toBe(6);
    expect(await prisma.providerSpendAttempt.count({ where: { workspaceId: ctx.workspaceId, state: "SETTLED" } })).toBe(6);
    expect(await prisma.providerActivationGrant.count({ where: { workspaceId: ctx.workspaceId, status: "REVOKED" } })).toBe(2);
    expect(await prisma.providerLaneControl.findUniqueOrThrow({ where: { id: "provider-lane-global" } })).toMatchObject({ state: "DISABLED" });
  });

  it("refuses a second campaign on prior grant evidence without redispatch", async () => {
    const ctx = await context("replay");
    const provider = transport();
    const input = {
      ...ctx,
      campaignId: "r37-openrouter-replay-v1",
      transport: provider,
      writeAttemptEvidence: async () => undefined,
      now: () => new Date("2026-09-04T12:00:00.000Z"),
    };
    await runR37OpenRouterCampaign(input);
    await expect(runR37OpenRouterCampaign(input)).rejects.toThrow("R37_AMBIGUOUS_PRIOR_CAMPAIGN");
    expect(provider).toHaveBeenCalledTimes(6);
  });

  it("revokes and disables after a provider failure without fabricating a pass", async () => {
    const ctx = await context("failure");
    const provider = vi.fn(async () => { throw new Error("R37_PROVIDER_TRANSPORT_FAILURE"); });
    const report = await runR37OpenRouterCampaign({
      ...ctx,
      campaignId: "r37-openrouter-failure-v1",
      transport: provider,
      writeAttemptEvidence: async () => undefined,
      now: () => new Date("2026-09-04T12:00:00.000Z"),
    });
    expect(report).toMatchObject({ verdict: "REWORK", dispatchedCallCount: 1, grantsRevoked: true, providerLaneDisabled: true });
    expect(report.failureCodes).toContain("R37_PROVIDER_TRANSPORT_FAILURE");
    expect(await prisma.providerActivationGrant.count({ where: { workspaceId: ctx.workspaceId, status: "REVOKED" } })).toBe(2);
    expect(await prisma.providerLaneControl.findUniqueOrThrow({ where: { id: "provider-lane-global" } })).toMatchObject({ state: "DISABLED" });
  });
});
