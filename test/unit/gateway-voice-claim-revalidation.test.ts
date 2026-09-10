import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchVoiceGatewayAttempt, type AuthorizedVoiceGatewayAdmission } from "@/server/model-gateway/voice/dispatch";
import type { VoiceModelGatewayAdapter } from "@/server/model-gateway/voice/adapters/contract";

type Ledger={attempt:string;dispatchState:string;hold:string;ai:string;owner:string|null;gateway:string;segment:string;audits:string[]};
const f=vi.hoisted(()=>({state:{} as Ledger,queue:Promise.resolve() as Promise<unknown>,effects:[] as string[],dispatchCounts:[] as number[],refusalCounts:[] as number[],dispatch:vi.fn(),outsideRelease:vi.fn(),failAudit:false,sessionOpen:true,policyAllowed:true,breakerOpen:false,route:{id:"syn-route",canonicalHash:"syn-route-hash",adapterKey:"voice-synthetic-direct",billingProvider:"synthetic",endpointKey:"synthetic",modelKey:"synthetic",intermediary:null}}));
vi.mock("@/lib/db",()=>({prisma:{
 $queryRawUnsafe:async()=>[{clientId:"syn-client",sessionStatus:f.sessionOpen?"transcribing":"cancelled",expiresAt:new Date("2099-01-01"),consentVersion:"syn-consent",audioFingerprint:"sha256:synthetic"}],
 $transaction:async<T>(fn:(tx:unknown)=>Promise<T>)=>{
  const run=f.queue.then(async()=>{
   // Isolated serialized ledger commits only if callback succeeds. This is
   // a synthetic transaction model, not a PostgreSQL locking/durability test.
   const state=structuredClone(f.state);
   const tx={
    settle:()=>{state.hold="settled";},
    $queryRawUnsafe:async(sql:string,...args:unknown[])=>{
     if(sql.includes('FROM "AiOperation"'))return state.owner===args[1]&&state.ai==="running"?[{id:"syn-ai",subjectKind:"voice_intake",clientId:"syn-client"}]:[];
     if(sql.includes('FROM "VoiceIntakeSegment"'))return [{clientId:"syn-client",sessionStatus:f.sessionOpen?"transcribing":"cancelled",segmentStatus:state.segment,expiresAt:new Date("2099-01-01"),consentVersion:"syn-consent",audioFingerprint:"sha256:synthetic"}];
     throw Error("UNMODELED_SYNTHETIC_QUERY");
    },
    recordAudit:(event:{eventType:string})=>{if(f.failAudit)throw Error("SYNTHETIC_AUDIT_FAILURE");state.audits.push(event.eventType);},
    accountProviderSpendHold:{updateMany:async()=>{f.effects.push("release");if(state.hold!=="held")return {count:0};state.hold="released";return {count:1};}},
    $executeRawUnsafe:async(sql:string,...args:unknown[])=>{
     if(sql.startsWith('UPDATE "ModelGatewayAttempt"')){
      if(sql.includes("SET status='dispatched'")){
       const fenced=sql.includes('AND "dispatchState"=\'not_dispatched\'');
       const changed=state.attempt==="prepared"&&(!fenced||state.dispatchState==="not_dispatched")?1:0;f.dispatchCounts.push(changed);
       if(changed){state.attempt="dispatched";state.dispatchState="unaccounted";f.effects.push("dispatch-cas");}return changed;
      }
      if(sql.includes("SET status='cancelled_before_dispatch'")){
       const prepared=sql.includes("AND status='prepared'");const fenced=sql.includes('AND "dispatchState"=\'not_dispatched\'');
       const changed=(!prepared||state.attempt==="prepared")&&(!fenced||state.dispatchState==="not_dispatched")?1:0;f.refusalCounts.push(changed);
       if(changed){state.attempt="cancelled_before_dispatch";state.dispatchState="not_dispatched";f.effects.push("refusal-cas");}return changed;
      }
      if(sql.includes("SET status='uncertain'")){state.attempt="uncertain";state.dispatchState="unaccounted";return 1;}
      if(sql.includes("SET status='failed'")){state.attempt="failed";state.dispatchState="settled";return 1;}
      if(sql.includes("SET status='settled'")){state.attempt="settled";state.dispatchState="settled";return 1;}
     }
     if(sql.startsWith('UPDATE "AiOperation"')){
      f.effects.push("ai-fence");if(state.owner!==args[1]||(sql.includes("AND status='running'")&&state.ai!=="running"))return 0;
      state.ai=sql.includes("status='failed'")?"failed":sql.includes("status='succeeded'")?"succeeded":"abandoned";state.owner=null;return 1;
     }
     if(sql.startsWith('UPDATE "ModelGatewayOperation"')){state.gateway=sql.match(/SET status='([^']+)'/)![1];return 1;}
     if(sql.startsWith('UPDATE "VoiceIntakeSegment"')){if(sql.includes("status IN ('registered','failed')")&&!["registered","failed"].includes(state.segment))return 0;state.segment=sql.match(/SET status='([^']+)'/)![1];return 1;}
     if(sql.startsWith('INSERT INTO "VoiceTranscriptSegment"'))return 1;
     throw Error("UNMODELED_SYNTHETIC_SQL");
    },
   };
   const result=await fn(tx);f.state=state;return result;
  });f.queue=run.catch(()=>{});return run;
 },
}}));
vi.mock("@/server/ai-operations",()=>({claimAiOperation:vi.fn(),SupersededOperationError:class extends Error{}}));
vi.mock("@/server/account-spend",()=>({reserveAccountProviderSpend:vi.fn(),settleAccountSpendHold:async(tx:{settle:()=>void})=>tx.settle(),releaseAccountSpendHold:async()=>{f.outsideRelease();f.effects.push("outside-release");f.state.hold="released";}}));
vi.mock("@/server/model-gateway/evidence",()=>({appendGatewayAuditEvent:(tx:{recordAudit:(e:unknown)=>void},event:unknown)=>tx.recordAudit(event),canonicalFingerprint:()=>"sha256:synthetic"}));
vi.mock("@/server/model-gateway/operations",()=>({bindGatewayOperation:vi.fn(),createGatewayAttempt:vi.fn(),loadGatewayPolicySnapshot:async()=>({}),loadGatewayRouteSnapshots:async()=>[],persistGatewayDecision:vi.fn()}));
vi.mock("@/server/model-gateway/policy",()=>({resolveGatewayPolicy:()=>f.policyAllowed?{disposition:"route_authorized",policy:{},route:f.route}:{disposition:"refused"}}));
vi.mock("@/server/model-gateway/breakers",()=>({loadGatewayBreakerResolution:async()=>({status:f.breakerOpen?"open":"closed",generation:1})}));
vi.mock("@/server/model-gateway/voice/operations",()=>({reserveVoiceAiOperation:vi.fn()}));

const admission={status:"authorized",actorId:"syn-client",claim:{operationId:"syn-ai",operationKey:"syn-operation",lockedBy:"syn-owner",attempt:1},request:{subject:{kind:"voice_intake_segment",sessionId:"syn-session",segmentId:"syn-segment"},outputContractHash:"sha256:synthetic"},projection:{audioFingerprint:"sha256:synthetic",ordinal:0},policy:{id:"syn-policy"},route:f.route,operation:{id:"syn-gateway"},decision:{id:"syn-decision",breakerGeneration:1},attempt:{id:"syn-attempt",accountSpendHoldId:"syn-hold",requestEvidenceRef:"sha256:synthetic"}} as unknown as AuthorizedVoiceGatewayAdmission;
const adapter:VoiceModelGatewayAdapter={key:"voice-synthetic-direct",dispatch:envelope=>f.dispatch(envelope)};
const dispatch=(enabled=true,actorId="syn-client")=>dispatchVoiceGatewayAttempt({admission,actor:{id:actorId,role:"CLIENT"},adapter,rollout:{environment:"local",voiceEnabled:enabled},abortSignal:new AbortController().signal});
const uncertain={dispatchKnowledge:"dispatched_unknown",providerRequestRef:null,errorClass:"unknown_dispatched_outcome",httpStatus:null};
const response=(cost:bigint|null,errorClass:string|null="unknown_failure")=>({dispatchKnowledge:"response_received",providerRequestRef:null,errorClass,httpStatus:500,transcriptText:errorClass?null:"Synthetic text",responseEvidenceRef:"sha256:synthetic",usage:{measuredCostMicros:cost,audioSeconds:1,inputTokens:null,outputTokens:null}});
beforeEach(()=>{
 f.state={attempt:"prepared",dispatchState:"not_dispatched",hold:"held",ai:"running",owner:"syn-owner",gateway:"admitted",segment:"registered",audits:[]};
 f.queue=Promise.resolve();f.effects.length=0;f.dispatchCounts.length=0;f.refusalCounts.length=0;f.failAudit=false;f.sessionOpen=true;f.policyAllowed=true;f.breakerOpen=false;f.outsideRelease.mockClear();f.dispatch.mockReset();f.dispatch.mockResolvedValue(uncertain);
});
describe("Voice late refusal and acquisition fencing",()=>{
 it("settles measured spend on a response-received provider failure",async()=>{
  f.dispatch.mockResolvedValue(response(25n));await expect(dispatch()).resolves.toMatchObject({status:"failed"});expect(f.state).toMatchObject({hold:"settled",dispatchState:"settled",attempt:"failed"});expect(f.state.audits).toContain("model_gateway.spend.settled");
 });
 it.each(["unknown_failure",null])("keeps unknown cost uncertain even with response %s",async(errorClass)=>{
  f.dispatch.mockResolvedValue(response(null,errorClass));await expect(dispatch()).resolves.toMatchObject({status:"uncertain"});expect(f.state).toMatchObject({hold:"held",dispatchState:"unaccounted",attempt:"uncertain"});
 });
 it.each(["uncertain","failure","success"])("callback %s cannot overwrite a successor's logical state",async(kind)=>{
  f.dispatch.mockImplementation(async()=>{f.state.owner="syn-successor";f.state.gateway="running";f.state.segment="running";return kind==="uncertain"?uncertain:response(25n,kind==="failure"?"unknown_failure":null);});
  await expect(dispatch()).resolves.toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});expect(f.state).toMatchObject({owner:"syn-successor",ai:"running",gateway:"running",segment:"running",hold:"held",attempt:"uncertain",dispatchState:"unaccounted"});
 });
 it("cannot acquire after its AI owner is reclaimed",async()=>{
  f.state.owner="syn-successor";const snapshot=structuredClone(f.state);
  const result=await dispatch();expect(f.dispatch).not.toHaveBeenCalled();expect(f.state).toEqual(snapshot);expect(result).toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});
 });
 it("cannot acquire when the segment has already left its eligible state",async()=>{
  f.state.segment="succeeded";const snapshot=structuredClone(f.state);
  const result=await dispatch();expect(f.dispatch).not.toHaveBeenCalled();expect(f.state).toEqual(snapshot);expect(result).toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});
 });
 it("rechecks session closure after the initial subject read",async()=>{
  // The first load returns an eligible snapshot; the queued transaction begins
  // only after the synthetic session closes.
  let release!:()=>void;f.queue=new Promise<void>(resolve=>{release=resolve;});
  const pending=dispatch();await new Promise(resolve=>setTimeout(resolve,0));f.sessionOpen=false;const snapshot=structuredClone(f.state);release();
  const result=await pending;expect(f.dispatch).not.toHaveBeenCalled();expect(f.state).toEqual(snapshot);expect(result).toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});
 });
 it.each(["rollout","actor","session","policy","breaker"])("late %s refusal cannot mutate a dispatched winner",async(branch)=>{
  let finish!:(value:unknown)=>void;let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
  f.dispatch.mockImplementation(()=>{entered();return new Promise(resolve=>{finish=resolve;});});
  const winner=dispatch();await started;const snapshot=structuredClone(f.state);const effects=f.effects.length;
  if(branch==="session")f.sessionOpen=false;if(branch==="policy")f.policyAllowed=false;if(branch==="breaker")f.breakerOpen=true;
  const loser=await dispatch(branch!=="rollout",branch==="actor"?"syn-other":"syn-client");
  try {expect(f.state).toEqual(snapshot);expect(f.effects).toHaveLength(effects);expect(f.outsideRelease).not.toHaveBeenCalled();expect(loser).toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});expect(f.dispatch).toHaveBeenCalledOnce();}
  finally{finish(uncertain);await winner;}
 });
 it("legitimate refusal fences before release and AI completion",async()=>{
  await expect(dispatch(false)).resolves.toEqual({status:"refused",reasonClass:"voice_disabled"});
  expect(f.effects[0]).toBe("refusal-cas");expect(f.outsideRelease).not.toHaveBeenCalled();
  expect(f.state).toMatchObject({attempt:"cancelled_before_dispatch",hold:"released",ai:"failed",owner:null,gateway:"refused"});expect(f.state.audits).toHaveLength(2);expect(f.dispatch).not.toHaveBeenCalled();
 });
 it("rolls back refusal and hold release together when audit fails",async()=>{
  const snapshot=structuredClone(f.state);f.failAudit=true;
  await expect(dispatch(false)).rejects.toThrow("SYNTHETIC_AUDIT_FAILURE");expect(f.state).toEqual(snapshot);expect(f.dispatch).not.toHaveBeenCalled();
 });
 it("rolls back the refusal CAS if AI ownership is already superseded",async()=>{
  f.state.owner="syn-successor";const snapshot=structuredClone(f.state);
  const result=await dispatch(false);expect(f.state).toEqual(snapshot);expect(result).toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});expect(f.outsideRelease).not.toHaveBeenCalled();
 });
 it("returns non-terminal superseded to the losing acquisition caller",async()=>{
  f.state.attempt="dispatched";f.state.dispatchState="unaccounted";const snapshot=structuredClone(f.state);
  await expect(dispatch()).resolves.toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});expect(f.state).toEqual(snapshot);expect(f.dispatch).not.toHaveBeenCalled();
 });
 it("does not acquire a prepared row whose dispatch knowledge is already unaccounted",async()=>{
  f.state.dispatchState="unaccounted";const snapshot=structuredClone(f.state);
  const result=await dispatch();expect(f.state).toEqual(snapshot);expect(result).toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});expect(f.dispatch).not.toHaveBeenCalled();
 });
 it("retains exposure if the already-invoked adapter declares not_dispatched",async()=>{
  f.dispatch.mockResolvedValue({...uncertain,dispatchKnowledge:"not_dispatched",errorClass:"malformed_request"});
  await expect(dispatch()).resolves.toEqual({status:"uncertain",errorClass:"unknown_dispatched_outcome"});expect(f.state.hold).toBe("held");expect(f.outsideRelease).not.toHaveBeenCalled();
 });
 it("rolls back acquisition if its audit fails and invokes no adapter",async()=>{
  const snapshot=structuredClone(f.state);f.failAudit=true;await expect(dispatch()).rejects.toThrow("SYNTHETIC_AUDIT_FAILURE");expect(f.state).toEqual(snapshot);expect(f.dispatch).not.toHaveBeenCalled();
 });
 it("only one concurrent acquisition can invoke an adapter",async()=>{
  const results=await Promise.all([dispatch(),dispatch()]);
  expect(results).toEqual(expect.arrayContaining([{status:"superseded",reasonClass:"attempt_claim_lost"},{status:"uncertain",errorClass:"unknown_dispatched_outcome"}]));
  expect(f.dispatchCounts).toEqual([1,0]);expect(f.dispatch).toHaveBeenCalledOnce();expect(f.state.hold).toBe("held");
  expect(f.state.audits.filter(event=>event==="model_gateway.attempt.dispatched")).toHaveLength(1);
 });
 it("only one concurrent refusal can release and finalize",async()=>{
  const results=await Promise.all([dispatch(false),dispatch(false)]);
  expect(results).toEqual([{status:"refused",reasonClass:"voice_disabled"},{status:"superseded",reasonClass:"attempt_claim_lost"}]);
  expect(f.refusalCounts).toEqual([1]);expect(f.effects.filter(effect=>effect==="release")).toHaveLength(1);expect(f.state.audits).toHaveLength(2);expect(f.dispatch).not.toHaveBeenCalled();
 });
 it("a winning refusal prevents a stale acquisition from dispatching",async()=>{
  const results=await Promise.all([dispatch(false),dispatch()]);
  expect(results).toEqual([{status:"refused",reasonClass:"voice_disabled"},{status:"superseded",reasonClass:"attempt_claim_lost"}]);
  expect(f.state).toMatchObject({hold:"released",attempt:"cancelled_before_dispatch",gateway:"refused"});expect(f.dispatch).not.toHaveBeenCalled();
 });
});
