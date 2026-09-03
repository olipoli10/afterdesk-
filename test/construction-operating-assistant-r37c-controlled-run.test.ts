import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { R36B_CANDIDATE_PACKETS, sealSandboxCase } from "@/lib/construction-operating-assistant-r36b/candidates";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { prepareOpenRouterControllerPlan } from "@/lib/construction-operating-assistant-r36b/openrouter";
import {
  assertSealedSyntheticAttempt,
  executeControlledSyntheticAttemptSchema,
} from "@/lib/construction-operating-assistant-r37c/contracts";
import { sealSyntheticAttempt } from "@/server/construction-operating-assistant-r37a/sealed-executor";

const executorFingerprint = `sha256:${"e".repeat(64)}`;

function sealedAttempt() {
  const sandboxCase = sealSandboxCase({
    schemaVersion: 1,
    caseId: "R36B-R37C-CONTRACT",
    caseVersion: 1,
    intent: "CONTROLLER_REASONING",
    locale: "fr-CA",
    region: "CA",
    orderedFacts: [{ key: "chantier", value: "Laval synthétique" }],
    dataClass: "business_confidential",
    outputContractKey: "controlled-run-v1",
    ceilings: { maxLatencyMs: 10_000, maxCostMicros: 500, maxOutputTokens: 1_000, maxSources: 5 },
    syntheticOnly: true,
  });
  const campaign = createR37CampaignManifest({ packets: Object.values(R36B_CANDIDATE_PACKETS), cases: [sandboxCase] });
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

describe("R37C controlled provider run contract", () => {
  it("requires exact positive bounded orchestration input", () => {
    const sealed = sealedAttempt();
    const valid = {
      actorId: "actor",
      workspaceId: "workspace",
      grantId: "grant",
      idempotencyKey: "controlled-run-1",
      sealedExecutorFingerprint: executorFingerprint,
      reservedMicros: 500n,
      leaseDurationMs: 30_000,
      sealed,
    };
    expect(executeControlledSyntheticAttemptSchema.parse(valid)).toMatchObject(valid);
    expect(() => executeControlledSyntheticAttemptSchema.parse({ ...valid, reservedMicros: 0n })).toThrow();
    expect(() => executeControlledSyntheticAttemptSchema.parse({ ...valid, leaseDurationMs: 999 })).toThrow();
    expect(() => executeControlledSyntheticAttemptSchema.parse({ ...valid, credential: "forbidden" })).toThrow();
  });

  it("refuses independently drifted sealed, case and prepared-request fingerprints", () => {
    const sealed = sealedAttempt();
    expect(assertSealedSyntheticAttempt(sealed)).toBe(sealed);
    expect(() => assertSealedSyntheticAttempt({ ...sealed, sealedAttemptFingerprint: `sha256:${"0".repeat(64)}` })).toThrow("R37C_SEALED_ATTEMPT_DRIFT");
    expect(() => assertSealedSyntheticAttempt({ ...sealed, sandboxCase: { ...sealed.sandboxCase, caseFingerprint: `sha256:${"1".repeat(64)}` } })).toThrow("R37C_CASE_FINGERPRINT_DRIFT");
    expect(() => assertSealedSyntheticAttempt({ ...sealed, preparedRequest: { ...sealed.preparedRequest, preparedRequestFingerprint: `sha256:${"2".repeat(64)}` } })).toThrow("R37C_PREPARED_REQUEST_DRIFT");
  });

  it("contains no provider client, credential resolution or network transport", () => {
    const source = [
      "src/lib/construction-operating-assistant-r37c/contracts.ts",
      "src/server/construction-operating-assistant-r37c/coordinator.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\bfetch\s*\(|axios|process\.env|Bun\.env|Deno\.env|\bAuthorization\s*:/u);
    expect(source).not.toMatch(/sk-[A-Za-z0-9]|pplx-[A-Za-z0-9]/u);
    expect(source).toContain("externalTransportPerformed: false");
  });
});
