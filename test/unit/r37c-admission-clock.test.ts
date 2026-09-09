import { beforeEach, describe, expect, it, vi } from "vitest";
import { R36B_CANDIDATE_PACKETS, sealSandboxCase } from "@/lib/construction-operating-assistant-r36b/candidates";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { prepareOpenRouterControllerPlan } from "@/lib/construction-operating-assistant-r36b/openrouter";
import { sealSyntheticAttempt } from "@/server/construction-operating-assistant-r37a/sealed-executor";
import { executeControlledSyntheticAttempt } from "@/server/construction-operating-assistant-r37c/coordinator";

const mocks=vi.hoisted(()=>({transaction:vi.fn(),reserve:vi.fn(),settle:vi.fn(),release:vi.fn(),member:vi.fn(),audit:vi.fn(),findRun:vi.fn(),updateRun:vi.fn(),updateRuns:vi.fn(),findSpend:vi.fn(),grant:vi.fn(),lane:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:mocks.transaction,controlledProviderRun:{findUniqueOrThrow:mocks.findRun,update:mocks.updateRun,updateMany:mocks.updateRuns},providerActivationGrant:{findFirst:mocks.grant},providerLaneControl:{findUnique:mocks.lane},providerSpendAttempt:{findUniqueOrThrow:mocks.findSpend}}}));
vi.mock("@/server/construction-assistant-v1/workspace",()=>({requireActiveConstructionMember:mocks.member,ConstructionAccessDenied:class extends Error{}}));
vi.mock("@/server/construction-assistant-v1/audit",()=>({appendConstructionAudit:mocks.audit}));
vi.mock("@/server/construction-operating-assistant-r37b/activation",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/server/construction-operating-assistant-r37b/activation")>();
  return {...original,reserveProviderSpend:mocks.reserve,settleProviderSpend:mocks.settle,releaseProviderSpend:mocks.release};
});

const start=new Date("2026-09-02T12:00:00.000Z");
const expiry=new Date("2026-09-02T13:00:00.000Z");
function fixture(){
  const sandboxCase=sealSandboxCase({schemaVersion:1,caseId:"R36B-R37C-ADMISSION-CLOCK",caseVersion:1,intent:"CONTROLLER_REASONING",locale:"fr-CA",region:"CA",orderedFacts:[{key:"site",value:"Simulation Laval"}],dataClass:"business_confidential",outputContractKey:"clock-v1",ceilings:{maxLatencyMs:10000,maxCostMicros:10,maxOutputTokens:100,maxSources:1},syntheticOnly:true});
  const sealed=sealSyntheticAttempt({campaign:createR37CampaignManifest({packets:Object.values(R36B_CANDIDATE_PACKETS),cases:[sandboxCase]}),sandboxCase,requestPlan:prepareOpenRouterControllerPlan(crypto.randomUUID(),sandboxCase),authorization:{schemaVersion:1,executionMode:"SYNTHETIC_TRANSPORT",authorizationId:crypto.randomUUID(),authorizedAt:start.toISOString(),expiresAt:expiry.toISOString(),candidateKey:"OPENROUTER_CONTROLLER",exactModelId:"example/fixture"},now:start.toISOString()});
  return {actorId:"owner",workspaceId:"synthetic",grantId:"grant",idempotencyKey:crypto.randomUUID(),sealedExecutorFingerprint:`sha256:${"e".repeat(64)}`,reservedMicros:10n,leaseDurationMs:30000,sealed};
}

describe("R37C fresh clock after asynchronous admission work",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it.each(["sealed authorization","grant","terminal sealed authorization"])("enforces fresh %s before admission or terminal evidence",async(which)=>{
    const input=fixture();let current=start;let state="PREPARED";
    let failureCode:string|null=null;
    let leaseToken:string|null=null;let leaseExpiresAt:Date|null=null;
    const row=()=>({id:"run",state,version:1,spendAttemptId:"attempt",evidenceSnapshot:null,failureCode,settlementCommandId:crypto.randomUUID(),releaseCommandId:crypto.randomUUID(),workspaceId:input.workspaceId,grantId:input.grantId,idempotencyKey:input.idempotencyKey,sealedAttemptFingerprint:input.sealed.sealedAttemptFingerprint,sealedExecutorFingerprint:input.sealedExecutorFingerprint,exactModelId:input.sealed.authorization.exactModelId,caseFingerprint:input.sealed.sandboxCase.caseFingerprint,leaseToken,leaseExpiresAt});
    const grant={id:"grant",candidateKey:"OPENROUTER_CONTROLLER",status:"ACTIVE",expiresAt:which==="grant"?expiry:new Date("2099-01-01"),sealedExecutorFingerprint:input.sealedExecutorFingerprint,exactModelId:input.sealed.authorization.exactModelId,allowedCaseFingerprints:[input.sealed.sandboxCase.caseFingerprint]};
    mocks.grant.mockResolvedValue(grant);mocks.lane.mockResolvedValue({state:"ENABLED"});
    const tx={$queryRaw:vi.fn(),providerActivationGrant:{findFirst:vi.fn(async()=>grant)},providerLaneControl:{findUnique:vi.fn(async()=>({state:"ENABLED"}))},controlledProviderRun:{findUnique:vi.fn(async()=>null),create:vi.fn(async()=>row()),findUniqueOrThrow:vi.fn(async()=>row()),update:vi.fn(async({data}:{data:{leaseToken:string;leaseExpiresAt:Date}})=>{state="RUNNING";leaseToken=data.leaseToken;leaseExpiresAt=data.leaseExpiresAt;return row();})}};
    mocks.member.mockResolvedValue({role:"owner"});mocks.reserve.mockResolvedValue({attempt:{id:"attempt"}});
    mocks.transaction.mockImplementation(async(callback:(value:typeof tx)=>Promise<unknown>)=>{
      const result=await callback(tx);
      // First transaction is preparation; time then advances in the subsequent
      // grant DB await, before point-of-use authorization.
      tx.providerActivationGrant.findFirst.mockImplementation(async()=>{if(which!=="terminal sealed authorization")current=expiry;return grant;});
      return result;
    });
    mocks.updateRuns.mockImplementation(async(args:{data:{state?:string;failureCode?:string}})=>{
      const data=args.data;state=data.state??state;failureCode=data.failureCode??failureCode;return {count:1};
    });
    mocks.findRun.mockImplementation(async()=>row());
    mocks.findSpend.mockResolvedValue({id:"attempt",version:1,state:"RESERVED"});
    mocks.updateRun.mockImplementation(async()=>{state="FAILED";return row();});
    const terminal=which==="terminal sealed authorization";
    const adapter=vi.fn(async()=>{if(terminal)current=expiry;return {body:{fixture:true},latencyMs:1,costMicros:1,externalTransportPerformed:false};});
    const result=await executeControlledSyntheticAttempt(input,adapter,{clock:{now:()=>new Date(current)}});
    expect(result).toMatchObject({disposition:"FAILED",adapterInvoked:terminal,failureCode:which==="grant"?"R37C_GRANT_INACTIVE_AT_USE":"R37A_AUTHORIZATION_EXPIRED"});
    expect(adapter).toHaveBeenCalledTimes(terminal?1:0);expect(tx.controlledProviderRun.update).toHaveBeenCalledTimes(terminal?1:0);
    expect(mocks.updateRuns.mock.calls.every(([args])=>args.data.state!=="EVIDENCE_RECORDED")).toBe(true);
  });
});
