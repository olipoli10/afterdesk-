import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { R36B_CANDIDATE_PACKETS, sealSandboxCase } from "@/lib/construction-operating-assistant-r36b/candidates";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { prepareOpenRouterControllerPlan } from "@/lib/construction-operating-assistant-r36b/openrouter";
import {
  requestObservedProviderExecution,
  runSyntheticAttempt,
  sealSyntheticAttempt,
} from "@/server/construction-operating-assistant-r37a/sealed-executor";

const ceilings = { maxLatencyMs: 10_000, maxCostMicros: 500_000, maxOutputTokens: 1_000, maxSources: 5 };
const controllerCase = sealSandboxCase({
  schemaVersion: 1,
  caseId: "R36B-CONTROLLER-37A",
  caseVersion: 1,
  intent: "CONTROLLER_REASONING",
  locale: "fr-CA",
  region: "CA",
  orderedFacts: [{ key: "chantier", value: "Rénovation Laval synthétique" }],
  dataClass: "business_confidential",
  outputContractKey: "assistant-controller-result-v1",
  ceilings,
  syntheticOnly: true,
});

function currentCampaign() {
  return createR37CampaignManifest({
    packets: Object.values(R36B_CANDIDATE_PACKETS),
    cases: [controllerCase],
  });
}

function authorization(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    executionMode: "SYNTHETIC_TRANSPORT",
    authorizationId: "30000000-0000-4000-8000-000000000001",
    authorizedAt: "2026-09-02T12:00:00.000Z",
    expiresAt: "2026-09-02T13:00:00.000Z",
    candidateKey: "OPENROUTER_CONTROLLER",
    exactModelId: "example/controller-v1",
    ...overrides,
  };
}

describe("R37A sealed provider executor", () => {
  it("seals current synthetic R36B controller input while retaining strict privacy", () => {
    const plan = prepareOpenRouterControllerPlan("30000000-0000-4000-8000-000000000002", controllerCase);
    const sealed = sealSyntheticAttempt({ campaign: currentCampaign(), sandboxCase: controllerCase, requestPlan: plan, authorization: authorization(), now: "2026-09-02T12:30:00.000Z" });
    expect(sealed.preparedRequest).toMatchObject({
      dispatchable: false,
      candidateKey: "OPENROUTER_CONTROLLER",
      payload: { model: "example/controller-v1", provider: { allowFallbacks: false, dataCollection: "deny", zdr: true } },
    });
    expect(JSON.stringify(sealed)).not.toMatch(/api[_-]?key|Bearer|sk-/iu);
  });

  it("refuses before adapter invocation when authority or privacy binding is invalid", async () => {
    const plan = prepareOpenRouterControllerPlan("30000000-0000-4000-8000-000000000003", controllerCase);
    let calls = 0;
    const adapter = async () => { calls += 1; return { body: { ok: true }, latencyMs: 1, costMicros: 1, externalTransportPerformed: false }; };
    expect(() => sealSyntheticAttempt({ campaign: currentCampaign(), sandboxCase: controllerCase, requestPlan: plan, authorization: authorization({ candidateKey: "DIRECT_CONTROLLER_CONTROL" }), now: "2026-09-02T12:30:00.000Z" })).toThrow("R37A_DIRECT_CONTROLLER_UNBOUND");
    const sealed = sealSyntheticAttempt({ campaign: currentCampaign(), sandboxCase: controllerCase, requestPlan: plan, authorization: authorization({ expiresAt: "2026-09-02T12:01:00.000Z" }), now: "2026-09-02T12:00:30.000Z" });
    await expect(runSyntheticAttempt({ sealed, adapter, now: "2026-09-02T12:30:00.000Z" })).rejects.toThrow("R37A_AUTHORIZATION_EXPIRED");
    expect(calls).toBe(0);
  });

  it("accepts only bounded local synthetic output and permanently labels it synthetic", async () => {
    const plan = prepareOpenRouterControllerPlan("30000000-0000-4000-8000-000000000004", controllerCase);
    const sealed = sealSyntheticAttempt({ campaign: currentCampaign(), sandboxCase: controllerCase, requestPlan: plan, authorization: authorization(), now: "2026-09-02T12:30:00.000Z" });
    const result = await runSyntheticAttempt({ sealed, adapter: async () => ({ body: { result: "local fixture" }, latencyMs: 10, costMicros: 10, externalTransportPerformed: false }), now: "2026-09-02T12:30:00.000Z" });
    expect(result).toMatchObject({ evidenceLabel: "SYNTHETIC", externalDispatchPerformed: false, certified: false });
    await expect(runSyntheticAttempt({ sealed, adapter: async () => ({ body: { result: "x" }, latencyMs: 1, costMicros: 1, externalTransportPerformed: true }), now: "2026-09-02T12:30:00.000Z" })).rejects.toThrow("R37A_EXTERNAL_TRANSPORT_REFUSED");
  });

  it("has no observed provider mode in this local release", () => {
    expect(() => requestObservedProviderExecution()).toThrow("R37A_OBSERVED_PROVIDER_AUTHORITY_REQUIRED");
  });

  it("contains no network client, environment-secret read or automatic dispatch source", () => {
    const source = [
      "src/lib/construction-operating-assistant-r37a/contracts.ts",
      "src/server/construction-operating-assistant-r37a/sealed-executor.ts",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
    expect(source).not.toMatch(/\bfetch\s*\(|axios|process\.env|Bun\.env|Deno\.env|\bAuthorization\s*:/u);
    expect(source).not.toMatch(/sk-[A-Za-z0-9]|pplx-[A-Za-z0-9]/u);
  });
});
