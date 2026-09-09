import { describe, expect, it } from "vitest";
import {
  activateProviderActivationGrantSchema,
  prepareProviderActivationGrantSchema,
  reserveProviderSpendSchema,
  revokeProviderActivationGrantSchema,
  setProviderLaneControlSchema,
} from "@/lib/construction-operating-assistant-r37b/contracts";
import { executeControlledSyntheticAttemptSchema } from "@/lib/construction-operating-assistant-r37c/contracts";
import { R36B_CANDIDATE_PACKETS, sealSandboxCase } from "@/lib/construction-operating-assistant-r36b/candidates";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { prepareOpenRouterControllerPlan } from "@/lib/construction-operating-assistant-r36b/openrouter";
import { sealSyntheticAttempt } from "@/server/construction-operating-assistant-r37a/sealed-executor";
import { prepareProviderActivationGrant } from "@/server/construction-operating-assistant-r37b/activation";
import { executeControlledSyntheticAttempt } from "@/server/construction-operating-assistant-r37c/coordinator";

const fingerprint = `sha256:${"a".repeat(64)}`;
const callerNow = new Date("2000-01-01T00:00:00.000Z");

function validSealedAttempt() {
  const sandboxCase = sealSandboxCase({
    schemaVersion: 1,
    caseId: "R36B-R37H-TRUSTED-CLOCK",
    caseVersion: 1,
    intent: "CONTROLLER_REASONING",
    locale: "fr-CA",
    region: "CA",
    orderedFacts: [{ key: "project", value: "synthetic Laval" }],
    dataClass: "business_confidential",
    outputContractKey: "trusted-clock-v1",
    ceilings: { maxLatencyMs: 5_000, maxCostMicros: 1, maxOutputTokens: 100, maxSources: 1 },
    syntheticOnly: true,
  });
  const campaign = createR37CampaignManifest({
    packets: Object.values(R36B_CANDIDATE_PACKETS),
    cases: [sandboxCase],
  });
  return sealSyntheticAttempt({
    campaign,
    sandboxCase,
    requestPlan: prepareOpenRouterControllerPlan(crypto.randomUUID(), sandboxCase),
    authorization: {
      schemaVersion: 1,
      executionMode: "SYNTHETIC_TRANSPORT",
      authorizationId: crypto.randomUUID(),
      authorizedAt: "2026-09-02T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      candidateKey: "OPENROUTER_CONTROLLER",
      exactModelId: "example/model",
    },
    now: "2026-09-02T00:01:00.000Z",
  });
}

describe("R37H provider trusted clock boundary", () => {
  it.each([
    ["prepare", prepareProviderActivationGrantSchema, {
      commandId: crypto.randomUUID(), actorId: "owner", workspaceId: "workspace",
      candidateKey: "OPENROUTER_CONTROLLER", exactModelId: "example/model",
      sealedExecutorFingerprint: fingerprint, allowedCaseFingerprints: [fingerprint],
      expiresAt: new Date("2099-01-01T00:00:00.000Z"), maxCallCount: 1,
      maxTotalSpendMicros: 1n, now: callerNow,
    }],
    ["activate", activateProviderActivationGrantSchema, {
      commandId: crypto.randomUUID(), actorId: "owner", workspaceId: "workspace",
      grantId: "grant", expectedVersion: 1, sealedExecutorFingerprint: fingerprint, now: callerNow,
    }],
    ["reserve", reserveProviderSpendSchema, {
      actorId: "owner", workspaceId: "workspace", grantId: "grant", idempotencyKey: "attempt",
      candidateKey: "OPENROUTER_CONTROLLER",
      caseFingerprint: fingerprint, exactModelId: "example/model",
      sealedExecutorFingerprint: fingerprint, requestedMicros: 1n, now: callerNow,
    }],
    ["revoke", revokeProviderActivationGrantSchema, {
      commandId: crypto.randomUUID(), actorId: "owner", workspaceId: "workspace",
      grantId: "grant", expectedVersion: 1, reason: "stop", now: callerNow,
    }],
    ["lane", setProviderLaneControlSchema, {
      commandId: crypto.randomUUID(), actorId: "admin", state: "DISABLED",
      reason: "stop", expectedVersion: 0, now: callerNow,
    }],
  ])("rejects caller-controlled time for %s", (_name, schema, input) => {
    expect(() => schema.parse(input)).toThrow();
  });

  it("rejects caller-controlled time for controlled execution before sealed validation", () => {
    const parsed = executeControlledSyntheticAttemptSchema.safeParse({
      actorId: "owner", workspaceId: "workspace", grantId: "grant", idempotencyKey: "run",
      sealedExecutorFingerprint: fingerprint, reservedMicros: 1n, leaseDurationMs: 30_000,
      now: callerNow, sealed: {},
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.code === "unrecognized_keys" && issue.keys.includes("now"))).toBe(true);
    }
  });

  it("fails closed on an invalid internal clock before any database or adapter work", async () => {
    const invalidClock = { now: () => new Date(Number.NaN) };
    await expect(prepareProviderActivationGrant({
      commandId: crypto.randomUUID(), actorId: "owner", workspaceId: "workspace",
      candidateKey: "OPENROUTER_CONTROLLER", exactModelId: "example/model",
      sealedExecutorFingerprint: fingerprint, allowedCaseFingerprints: [fingerprint],
      expiresAt: new Date("2099-01-01T00:00:00.000Z"), maxCallCount: 1,
      maxTotalSpendMicros: 1n,
    }, invalidClock)).rejects.toThrow("R37_TRUSTED_CLOCK_INVALID");

    let adapterCalls = 0;
    await expect(executeControlledSyntheticAttempt({
      actorId: "owner", workspaceId: "workspace", grantId: "grant", idempotencyKey: "run",
      sealedExecutorFingerprint: fingerprint, reservedMicros: 1n, leaseDurationMs: 30_000,
      sealed: validSealedAttempt(),
    }, async () => {
      adapterCalls += 1;
      return { body: {}, latencyMs: 1, costMicros: 1, externalTransportPerformed: false };
    }, { clock: invalidClock })).rejects.toThrow("R37_TRUSTED_CLOCK_INVALID");
    expect(adapterCalls).toBe(0);
  });
});
