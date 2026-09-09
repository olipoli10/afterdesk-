import { afterEach, describe, expect, it, vi } from "vitest";
import { R36B_CANDIDATE_PACKETS, sealSandboxCase } from "@/lib/construction-operating-assistant-r36b/candidates";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { prepareOpenRouterControllerPlan } from "@/lib/construction-operating-assistant-r36b/openrouter";
import { runSyntheticAttempt, sealSyntheticAttempt } from "@/server/construction-operating-assistant-r37a/sealed-executor";

const start = "2026-09-02T12:00:00.000Z";
const expiry = "2026-09-02T13:00:00.000Z";
function sealedAttempt() {
  const sandboxCase = sealSandboxCase({ schemaVersion:1, caseId:"R36B-R37A-CLOCK-SYNTHETIC", caseVersion:1, intent:"CONTROLLER_REASONING", locale:"fr-CA", region:"CA", orderedFacts:[{key:"site",value:"Simulation Laval"}], dataClass:"business_confidential", outputContractKey:"clock-v1", ceilings:{maxLatencyMs:10000,maxCostMicros:10,maxOutputTokens:100,maxSources:1}, syntheticOnly:true });
  return sealSyntheticAttempt({ campaign:createR37CampaignManifest({packets:Object.values(R36B_CANDIDATE_PACKETS),cases:[sandboxCase]}), sandboxCase, requestPlan:prepareOpenRouterControllerPlan(crypto.randomUUID(),sandboxCase), authorization:{schemaVersion:1,executionMode:"SYNTHETIC_TRANSPORT",authorizationId:crypto.randomUUID(),authorizedAt:start,expiresAt:expiry,candidateKey:"OPENROUTER_CONTROLLER",exactModelId:"example/fixture"}, now:start });
}
const localResult = () => ({body:{fixture:true},latencyMs:1,costMicros:1,externalTransportPerformed:false});

describe("R37A runtime time is not request data", () => {
  afterEach(() => vi.useRealTimers());
  it("rejects a historical now supplied in runtime input before invoking the fixture", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-03T00:00:00.000Z"));
    const adapter=vi.fn(async()=>localResult());
    const input={sealed:sealedAttempt(),adapter,now:start};
    await expect(runSyntheticAttempt(input)).rejects.toThrow("R37A_CALLER_TIME_REFUSED");
    expect(adapter).not.toHaveBeenCalled();
  });
  it("rechecks wall-clock expiry after the fixture, even if monotonic latency is low", async () => {
    vi.useFakeTimers();vi.setSystemTime(new Date(start));
    const adapter=vi.fn(async()=>{vi.setSystemTime(new Date(expiry));return localResult();});
    await expect(runSyntheticAttempt({sealed:sealedAttempt(),adapter})).rejects.toThrow("R37A_AUTHORIZATION_EXPIRED");
    expect(adapter).toHaveBeenCalledOnce();
  });
  it("rechecks immediately before fixture admission after a queued clock change", async () => {
    vi.useFakeTimers();vi.setSystemTime(new Date(start));
    const adapter=vi.fn(async()=>localResult());
    const result=runSyntheticAttempt({sealed:sealedAttempt(),adapter});
    vi.setSystemTime(new Date(expiry));
    await expect(result).rejects.toThrow("R37A_AUTHORIZATION_EXPIRED");
    expect(adapter).not.toHaveBeenCalled();
  });
  it("retains historical seal preparation without granting current execution", async () => {
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-03T00:00:00.000Z"));
    const sealed=sealedAttempt();const adapter=vi.fn(async()=>localResult());
    expect(sealed.preparedRequest.dispatchable).toBe(false);
    await expect(runSyntheticAttempt({sealed,adapter})).rejects.toThrow("R37A_AUTHORIZATION_EXPIRED");
    expect(adapter).not.toHaveBeenCalled();
  });
  it("documents that a fixture callback may perform arbitrary local side effects; flags are declarations", async () => {
    vi.useFakeTimers();vi.setSystemTime(new Date(start));
    let localSideEffects=0;
    const evidence=await runSyntheticAttempt({sealed:sealedAttempt(),adapter:async()=>{localSideEffects++;return localResult();}});
    expect(localSideEffects).toBe(1);
    expect(evidence).toMatchObject({evidenceLabel:"SYNTHETIC",certified:false,externalDispatchPerformed:false});
    // No network operation is attempted: this demonstrates the trusted-code seam,
    // not either successful egress or isolation of an untrusted callback.
  });
});
