import { describe, expect, it } from "vitest";
import { R36B_CANDIDATE_PACKETS, sealSandboxCase } from "@/lib/construction-operating-assistant-r36b/candidates";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { prepareOpenRouterControllerPlan } from "@/lib/construction-operating-assistant-r36b/openrouter";
import {
  runSyntheticAttempt,
  sealSyntheticAttempt,
} from "@/server/construction-operating-assistant-r37a/sealed-executor";

function sealedAttempt() {
  const sandboxCase = sealSandboxCase({
    schemaVersion: 1,
    caseId: "R36B-R37G-RUNTIME-SEAL",
    caseVersion: 1,
    intent: "CONTROLLER_REASONING",
    locale: "fr-CA",
    region: "CA",
    orderedFacts: [{ key: "project", value: "Laval synthetic" }],
    dataClass: "business_confidential",
    outputContractKey: "provider-hardening-v1",
    ceilings: { maxLatencyMs: 5_000, maxCostMicros: 500, maxOutputTokens: 1_000, maxSources: 5 },
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
      authorizedAt: "2026-09-02T17:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      candidateKey: "OPENROUTER_CONTROLLER",
      exactModelId: "example/controller-v1",
    },
    now: "2026-09-02T17:01:00.000Z",
  });
}

describe("R37G provider security hardening", () => {
  it("rejects a forged sealed attempt at the exported R37A boundary before adapter invocation", async () => {
    const sealed = sealedAttempt();
    let calls = 0;
    await expect(runSyntheticAttempt({
      sealed: { ...sealed, sealedAttemptFingerprint: `sha256:${"0".repeat(64)}` },
      adapter: async () => {
        calls += 1;
        return { body: { ok: true }, latencyMs: 1, costMicros: 1, externalTransportPerformed: false };
      },
      now: "2026-09-02T18:00:00.000Z",
    })).rejects.toThrow("R37A_SEALED_ATTEMPT_DRIFT");
    expect(calls).toBe(0);
  });
});
