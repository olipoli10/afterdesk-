import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { R36B_CANDIDATE_PACKETS, sealSandboxCase } from "@/lib/construction-operating-assistant-r36b/candidates";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { prepareOpenRouterControllerPlan } from "@/lib/construction-operating-assistant-r36b/openrouter";
import { preparePerplexitySearchPlan } from "@/lib/construction-operating-assistant-r36b/perplexity";
import { sealSyntheticAttempt } from "@/server/construction-operating-assistant-r37a/sealed-executor";
import {
  activateProviderActivationGrant,
  prepareProviderActivationGrant,
  setProviderLaneControl,
} from "@/server/construction-operating-assistant-r37b/activation";
import { executeControlledSyntheticProviderDelivery } from "@/server/construction-operating-assistant-r37f/provider-delivery";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";

const executorFingerprint = `sha256:${"f".repeat(64)}`;
const now = new Date("2026-09-02T20:00:00.000Z");

async function user(label: string, role: "CLIENT" | "ADMIN" = "CLIENT") {
  return prisma.user.create({
    data: {
      name: `R37F ${label}`,
      email: `r37f-${label}-${crypto.randomUUID()}@example.invalid`,
      role,
      emailVerified: true,
    },
  });
}

async function enableLane(adminId: string) {
  const current = await prisma.providerLaneControl.findUnique({ where: { id: "provider-lane-global" } });
  if (current?.state === "ENABLED") return;
  await setProviderLaneControl({
    commandId: crypto.randomUUID(),
    actorId: adminId,
    state: "ENABLED",
    reason: "R37F synthetic delivery integration",
    expectedVersion: current?.version ?? 0,
    now,
  });
}

async function context(candidateKey: "OPENROUTER_CONTROLLER" | "PERPLEXITY_SEARCH", label: string) {
  const owner = await user(`${label}-owner`);
  const admin = await user(`${label}-admin`, "ADMIN");
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R37F ${label}` });
  const exactModelId = candidateKey === "OPENROUTER_CONTROLLER" ? "example/controller-v1" : "example/search-v1";
  const sandboxCase = sealSandboxCase({
    schemaVersion: 1,
    caseId: `R36B-R37F-${label.toUpperCase()}`,
    caseVersion: 1,
    intent: candidateKey === "OPENROUTER_CONTROLLER" ? "CONTROLLER_REASONING" : "PUBLIC_BUSINESS_RESEARCH",
    locale: "fr-CA",
    region: "CA",
    orderedFacts: [{ key: "question", value: `preuve synthétique ${label}` }],
    dataClass: candidateKey === "OPENROUTER_CONTROLLER" ? "business_confidential" : "public",
    outputContractKey: candidateKey === "OPENROUTER_CONTROLLER" ? "controller-result-v1" : "research-result-v1",
    ceilings: { maxLatencyMs: 5_000, maxCostMicros: 500, maxOutputTokens: 1_000, maxSources: 5 },
    syntheticOnly: true,
  });
  const campaign = createR37CampaignManifest({ packets: Object.values(R36B_CANDIDATE_PACKETS), cases: [sandboxCase] });
  const requestPlan = candidateKey === "OPENROUTER_CONTROLLER"
    ? prepareOpenRouterControllerPlan(crypto.randomUUID(), sandboxCase)
    : preparePerplexitySearchPlan(crypto.randomUUID(), sandboxCase);
  const sealed = sealSyntheticAttempt({
    campaign,
    sandboxCase,
    requestPlan,
    authorization: {
      schemaVersion: 1,
      executionMode: "SYNTHETIC_TRANSPORT",
      authorizationId: crypto.randomUUID(),
      authorizedAt: "2026-09-02T19:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      candidateKey,
      exactModelId,
    },
    now: "2026-09-02T19:01:00.000Z",
  });
  await enableLane(admin.id);
  const prepared = await prepareProviderActivationGrant({
    commandId: crypto.randomUUID(),
    actorId: owner.id,
    workspaceId: workspace.workspaceId,
    candidateKey,
    exactModelId,
    sealedExecutorFingerprint: executorFingerprint,
    allowedCaseFingerprints: [sandboxCase.caseFingerprint],
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    maxCallCount: 2,
    maxTotalSpendMicros: 1_000n,
    now,
  });
  const activated = await activateProviderActivationGrant({
    commandId: crypto.randomUUID(),
    actorId: owner.id,
    workspaceId: workspace.workspaceId,
    grantId: prepared.grant.id,
    expectedVersion: 1,
    sealedExecutorFingerprint: executorFingerprint,
    now,
  });
  return {
    input: {
      actorId: owner.id,
      workspaceId: workspace.workspaceId,
      grantId: activated.grant.id,
      idempotencyKey: `delivery-${label}`,
      sealedExecutorFingerprint: executorFingerprint,
      reservedMicros: 500n,
      leaseDurationMs: 30_000,
      now,
      sealed,
    },
    grantId: activated.grant.id,
    exactModelId,
  };
}

function openRouterFixture(model = "example/controller-v1") {
  return {
    fixture: {
      responseId: "synthetic-openrouter-r37f",
      model,
      providerRoute: "OPENROUTER_CONTROLLER",
      choices: [{ index: 0, finishReason: "stop", message: { role: "assistant", content: "Action synthétique exacte." } }],
      usage: { promptTokens: 12, completionTokens: 6, totalTokens: 18 },
      externalTransportPerformed: false,
    },
    latencyMs: 25,
    costMicros: 300,
    externalTransportPerformed: false,
  };
}

function perplexityFixture() {
  return {
    fixture: {
      responseId: "synthetic-perplexity-r37f",
      providerRoute: "PERPLEXITY_SEARCH",
      answer: "Réponse synthétique avec source publique.",
      citations: ["https://example.invalid/source"],
      results: [{ title: "Source synthétique", url: "https://example.invalid/source", snippet: "Fait public synthétique.", sourceDate: "2026-09-02" }],
      externalTransportPerformed: false,
    },
    latencyMs: 30,
    costMicros: 250,
    externalTransportPerformed: false,
  };
}

describe("R37F provider delivery orchestration on disposable PostgreSQL", () => {
  it("records exact OpenRouter canonical evidence and replays after reconnect without reinvocation", async () => {
    const ctx = await context("OPENROUTER_CONTROLLER", "openrouter");
    let calls = 0;
    const first = await executeControlledSyntheticProviderDelivery(ctx.input, async () => {
      calls += 1;
      return openRouterFixture(ctx.exactModelId);
    });
    expect(first.controlledRun).toMatchObject({ disposition: "SUCCEEDED", adapterInvoked: true });
    expect(first.canonicalEvidence).toMatchObject({ candidateKey: "OPENROUTER_CONTROLLER", answer: "Action synthétique exacte.", costMicros: 300 });
    expect(first.fixtureAdapterInvoked).toBe(true);
    await prisma.$disconnect();
    await prisma.$connect();
    const replay = await executeControlledSyntheticProviderDelivery(ctx.input, async () => {
      calls += 1;
      throw new Error("fixture adapter must not be reinvoked");
    });
    expect(replay.controlledRun.disposition).toBe("SUCCEEDED_REPLAY");
    expect(replay.canonicalEvidence).toEqual(first.canonicalEvidence);
    expect(replay.fixtureAdapterInvoked).toBe(false);
    expect(calls).toBe(1);
    const attempt = await prisma.providerSpendAttempt.findUniqueOrThrow({ where: { id: first.controlledRun.spendAttemptId! } });
    expect(attempt).toMatchObject({ state: "SETTLED", settledMicros: 300n, releasedMicros: 200n });
  });

  it("records citation-bound Perplexity evidence", async () => {
    const ctx = await context("PERPLEXITY_SEARCH", "perplexity");
    const result = await executeControlledSyntheticProviderDelivery(ctx.input, async () => perplexityFixture());
    expect(result.controlledRun.disposition).toBe("SUCCEEDED");
    expect(result.canonicalEvidence).toMatchObject({
      candidateKey: "PERPLEXITY_SEARCH",
      citationUrls: ["https://example.invalid/source"],
      costMicros: 250,
    });
    expect(result.canonicalEvidence?.sources).toHaveLength(1);
  });

  it("releases reserved spend when strict normalization refuses provider drift", async () => {
    const ctx = await context("OPENROUTER_CONTROLLER", "drift");
    const result = await executeControlledSyntheticProviderDelivery(ctx.input, async () => openRouterFixture("fallback/model"));
    expect(result.controlledRun).toMatchObject({
      disposition: "FAILED",
      failureCode: "R37C_SYNTHETIC_ADAPTER_FAILED",
      adapterInvoked: true,
    });
    expect(result.canonicalEvidence).toBeNull();
    const attempt = await prisma.providerSpendAttempt.findUniqueOrThrow({ where: { id: result.controlledRun.spendAttemptId! } });
    expect(attempt).toMatchObject({ state: "RELEASED", releasedMicros: 500n });
  });

  it("collapses concurrent identical deliveries to one fixture adapter and one durable result", async () => {
    const ctx = await context("OPENROUTER_CONTROLLER", "concurrent");
    let calls = 0;
    const adapter = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return openRouterFixture(ctx.exactModelId);
    };
    const results = await Promise.all(Array.from({ length: 50 }, () =>
      executeControlledSyntheticProviderDelivery(ctx.input, adapter)));
    expect(calls).toBe(1);
    expect(results.every((result) => result.canonicalEvidence?.evidenceFingerprint === results[0].canonicalEvidence?.evidenceFingerprint)).toBe(true);
    expect(await prisma.controlledProviderRun.count({ where: { grantId: ctx.grantId } })).toBe(1);
    expect(await prisma.providerSpendAttempt.count({ where: { grantId: ctx.grantId } })).toBe(1);
  });
});
