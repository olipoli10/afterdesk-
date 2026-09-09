import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizedGatewayAdmission } from "@/server/model-gateway/operations";
import { dispatchGatewayAttempt } from "@/server/model-gateway/dispatch";
import type { ModelGatewayAdapter } from "@/server/model-gateway/adapters/contract";

type Ledger = {
 attemptStatus:string; dispatchState:string; holdStatus:string; aiStatus:string;
 lockedBy:string|null; gatewayStatus:string; resultId:string|null; auditEvents:string[];
};
const fixture=vi.hoisted(()=>{
 const route={id:"syn-route",canonicalHash:"syn-route-hash",adapterKey:"synthetic",billingProvider:"synthetic",intermediary:null,endpointKey:"synthetic",modelKey:"synthetic",routeKey:"synthetic",version:1};
 return {route,state:{} as Ledger,queue:Promise.resolve() as Promise<unknown>,changedCounts:[] as number[],refusalCounts:[] as number[],effects:[] as string[],credentialCalls:vi.fn(),dispatch:vi.fn(),audit:vi.fn(),query:vi.fn(),succeedCalls:vi.fn(),failAudit:false};
});
vi.mock("@/lib/db",()=>{
 const transaction=async<T>(fn:(tx:unknown)=>Promise<T>)=>{
  const run=fixture.queue.then(async()=>{
   // Serialized, rollback-capable in-memory transaction fixture. This models
   // the transaction contract, NOT actual PostgreSQL locking or durability.
   const state=structuredClone(fixture.state);
   const tx={
    $queryRawUnsafe:async(_sql:string,...args:unknown[])=>state.lockedBy===args[1]&&state.aiStatus==="running"?[{id:"syn-ai"}]:[],
    recordAudit:(event:{eventType:string})=>{fixture.audit(event);if(fixture.failAudit)throw new Error("SYNTHETIC_AUDIT_FAILURE");state.auditEvents.push(event.eventType);},
    $executeRawUnsafe:async(sql:string)=>{
     if(sql.includes("SET status='dispatched'")){
      const changed=state.attemptStatus==="prepared"&&state.dispatchState==="not_dispatched"?1:0;
      fixture.changedCounts.push(changed);
      if(changed){state.attemptStatus="dispatched";fixture.effects.push("dispatch-cas");}
      return changed;
     }
     if(sql.includes("SET status='cancelled_before_dispatch'")){
      const fenced=sql.includes("AND status='prepared'")&&sql.includes('AND "dispatchState"=\'not_dispatched\'');
      const changed=!fenced||(state.attemptStatus==="prepared"&&state.dispatchState==="not_dispatched")?1:0;
      fixture.refusalCounts.push(changed);
      if(changed){state.attemptStatus="cancelled_before_dispatch";state.dispatchState="not_dispatched";fixture.effects.push("refusal-cas");}
      return changed;
     }
     if(sql.includes('UPDATE "ModelGatewayAttempt"')&&sql.includes("SET status='uncertain'")){
      if(state.attemptStatus!=="dispatched")return 0;
      state.attemptStatus="uncertain";state.dispatchState="unaccounted";return 1;
     }
     if(sql.includes('UPDATE "ModelGatewayOperation"')){
      if(sql.includes("status='refused'"))state.gatewayStatus="refused";
      if(sql.includes("status='uncertain'"))state.gatewayStatus="uncertain";
      return 1;
     }
     throw new Error("UNMODELED_SYNTHETIC_SQL");
    },
    accountProviderSpendHold:{updateMany:async()=>{
     fixture.effects.push("hold-release");
     if(state.holdStatus==="held"){state.holdStatus="released";return {count:1};}return {count:0};
    }},
    aiOperation:{
     updateMany:async(args:{where:{lockedBy?:string;status?:string};data:{status?:string;lockedBy?:null;resultId?:string}})=>{
      fixture.effects.push("ai-fence");
      if(args.where.lockedBy!==state.lockedBy||(args.where.status&&args.where.status!==state.aiStatus))return {count:0};
      state.aiStatus=args.data.status??state.aiStatus;
      if(Object.hasOwn(args.data,"lockedBy"))state.lockedBy=null;
      if(args.data.resultId)state.resultId=args.data.resultId;
      return {count:1};
     },
     update:async(args:{data:{resultId:string}})=>{fixture.effects.push("ai-result");state.resultId=args.data.resultId;return {};},
    },
   };
   const result=await fn(tx);fixture.state=state;return result;
  });
  fixture.queue=run.catch(()=>{});return run;
 };
 return {prisma:{$queryRawUnsafe:(...args:unknown[])=>fixture.query(...args),$transaction:transaction}};
});
vi.mock("@/server/ai-operations",async(importOriginal)=>{
 const actual=await importOriginal<typeof import("@/server/ai-operations")>();
 return {...actual,succeedAiOperation:async(...args:Parameters<typeof actual.succeedAiOperation>)=>{fixture.succeedCalls();return actual.succeedAiOperation(...args);}};
});
vi.mock("@/server/account-spend",()=>({settleAccountSpendHold:vi.fn()}));
vi.mock("@/server/model-gateway/operations",()=>({loadGatewayPolicySnapshot:async()=>({}),loadGatewayRouteSnapshots:async()=>[]}));
vi.mock("@/server/model-gateway/policy",()=>({resolveGatewayPolicy:()=>({disposition:"route_authorized",policy:{},route:fixture.route})}));
vi.mock("@/server/model-gateway/breakers",()=>({loadGatewayBreakerResolution:async()=>({status:"closed",generation:1})}));
vi.mock("@/server/model-gateway/evidence",()=>({appendGatewayAuditEvent:(tx:{recordAudit:(e:unknown)=>void},event:unknown)=>tx.recordAudit(event),canonicalFingerprint:()=>"sha256:synthetic",validateClassificationResponse:vi.fn()}));

// Explicit synthetic dependencies; real succeedAiOperation runs against this
// in-memory transaction fixture. No database server or provider is invoked.
const admission={status:"authorized",claim:{operationId:"syn-ai",operationKey:"syn-operation",lockedBy:"syn-owner",attempt:1},request:{taskId:"syn-task",tenantId:"syn-tenant",requestFingerprint:"syn-request",outputContractHash:"syn-output"},projection:{synthetic:true},policy:{id:"syn-policy"},route:fixture.route,operation:{id:"syn-operation"},decision:{id:"syn-decision",routeHash:"syn-route-hash",policyHash:"syn-policy-hash",breakerGeneration:1},attempt:{id:"syn-attempt",accountSpendHoldId:"syn-hold",requestEvidenceRef:"sha256:synthetic"}} as unknown as AuthorizedGatewayAdmission;
const adapter:ModelGatewayAdapter={key:"synthetic",dispatch:envelope=>fixture.dispatch(envelope)};
const dispatch=(enabled=true)=>dispatchGatewayAttempt({admission,adapter,abortSignal:new AbortController().signal,rollout:{environment:"local",classificationEnabled:enabled},credentialResolver:async()=>{fixture.credentialCalls();return adapter;}});
const uncertain={dispatchKnowledge:"dispatched_unknown",providerRequestRef:null,errorClass:"unknown_dispatched_outcome",httpStatus:null};
const lineage=()=>[{disposition:"route_authorized",routeProfileId:"syn-route",attemptStatus:fixture.state.attemptStatus,dispatchState:fixture.state.dispatchState,holdStatus:fixture.state.holdStatus,aiStatus:fixture.state.aiStatus,lockedBy:fixture.state.lockedBy}];
beforeEach(()=>{
 fixture.state={attemptStatus:"prepared",dispatchState:"not_dispatched",holdStatus:"held",aiStatus:"running",lockedBy:"syn-owner",gatewayStatus:"admitted",resultId:null,auditEvents:[]};
 fixture.queue=Promise.resolve();fixture.changedCounts.length=0;fixture.refusalCounts.length=0;fixture.effects.length=0;fixture.failAudit=false;
 fixture.credentialCalls.mockClear();fixture.dispatch.mockReset();fixture.audit.mockClear();fixture.query.mockReset();fixture.succeedCalls.mockClear();
 fixture.query.mockImplementation(async()=>lineage());fixture.dispatch.mockResolvedValue(uncertain);
});
describe("Gateway classification atomic dispatch claim",()=>{
 it("rechecks AI ownership atomically after its earlier lineage snapshot",async()=>{
  fixture.query.mockResolvedValue(lineage());fixture.state.lockedBy="syn-successor";const snapshot=structuredClone(fixture.state);
  const result=await dispatch();expect(fixture.dispatch).not.toHaveBeenCalled();expect(fixture.credentialCalls).not.toHaveBeenCalled();expect(fixture.state).toEqual(snapshot);expect(result).toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});
 });
 it("allows only the winner of two concurrent prepared-state readers to resolve credentials and dispatch",async()=>{
  const results=await Promise.allSettled([dispatch(),dispatch()]);
  expect(fixture.changedCounts).toEqual([1,0]);expect(fixture.dispatch).toHaveBeenCalledTimes(1);expect(fixture.credentialCalls).toHaveBeenCalledTimes(1);
  expect(results).toEqual(expect.arrayContaining([{status:"fulfilled",value:{status:"superseded",reasonClass:"attempt_claim_lost"}}]));
  expect(results.every(result=>result.status==="fulfilled")).toBe(true);
  expect(fixture.state.auditEvents.filter(event=>event==="model_gateway.attempt.dispatched")).toHaveLength(1);
 });
 it("retains one legitimate dispatch and the uncertain-result path",async()=>{
  await expect(dispatch()).resolves.toEqual({status:"uncertain",reasonClass:"unknown_dispatched_outcome"});
  expect(fixture.changedCounts).toEqual([1]);expect(fixture.dispatch).toHaveBeenCalledTimes(1);expect(fixture.state.holdStatus).toBe("held");
 });
 it("refuses an already-lost atomic claim before credential resolution",async()=>{
  fixture.query.mockResolvedValue(lineage());fixture.state.attemptStatus="dispatched";
  await expect(dispatch()).resolves.toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});
  expect(fixture.credentialCalls).not.toHaveBeenCalled();expect(fixture.dispatch).not.toHaveBeenCalled();expect(fixture.audit).not.toHaveBeenCalled();
 });
 it("late lineage reader cannot cancel the winner while its local adapter is pending",async()=>{
  let finish!: (value:unknown)=>void;let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
  fixture.dispatch.mockImplementation(()=>{entered();return new Promise(resolve=>{finish=resolve;});});
  const winner=dispatch();await started;
  const snapshot=structuredClone(fixture.state);const effects=fixture.effects.length;
  const loser=await dispatch();
  try {
   expect(fixture.state).toEqual(snapshot);expect(fixture.effects).toHaveLength(effects);
   expect(loser).toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});
   expect(fixture.succeedCalls).not.toHaveBeenCalled();expect(fixture.credentialCalls).toHaveBeenCalledTimes(1);expect(fixture.dispatch).toHaveBeenCalledTimes(1);
  } finally {finish(uncertain);await winner;}
 });
 it("disabled rollout cannot cancel an already dispatched winner",async()=>{
  fixture.state.attemptStatus="dispatched";const snapshot=structuredClone(fixture.state);
  const result=await dispatch(false);
  expect(fixture.state).toEqual(snapshot);expect(fixture.effects).toEqual([]);expect(fixture.succeedCalls).not.toHaveBeenCalled();
  expect(result).toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});
 });
 it("legitimate refusal fences the prepared attempt before AI finalization, hold release and audits",async()=>{
  await expect(dispatch(false)).resolves.toEqual({status:"refused",reasonClass:"rollout_disabled"});
  expect(fixture.effects[0]).toBe("refusal-cas");
  expect(fixture.state).toMatchObject({attemptStatus:"cancelled_before_dispatch",holdStatus:"released",aiStatus:"succeeded",lockedBy:null,gatewayStatus:"refused",resultId:"syn-operation"});
  expect(fixture.state.auditEvents).toEqual(["model_gateway.attempt.failed","model_gateway.spend.released"]);
  expect(fixture.credentialCalls).not.toHaveBeenCalled();expect(fixture.dispatch).not.toHaveBeenCalled();
 });
 it("rolls back every refusal mutation when the audit fails",async()=>{
  const snapshot=structuredClone(fixture.state);fixture.failAudit=true;
  await expect(dispatch(false)).rejects.toThrow("SYNTHETIC_AUDIT_FAILURE");
  expect(fixture.state).toEqual(snapshot);expect(fixture.dispatch).not.toHaveBeenCalled();
 });
 it("a superseded AI owner rolls back the successful attempt refusal fence",async()=>{
  fixture.state.lockedBy="syn-successor";const snapshot=structuredClone(fixture.state);
  await expect(dispatch(false)).resolves.toEqual({status:"superseded",reasonClass:"attempt_claim_lost"});
  expect(fixture.state).toEqual(snapshot);expect(fixture.state.auditEvents).toEqual([]);expect(fixture.dispatch).not.toHaveBeenCalled();
 });
 it("does not release exposure when the already-invoked adapter declares no dispatch",async()=>{
  fixture.dispatch.mockResolvedValue({...uncertain,dispatchKnowledge:"not_dispatched",errorClass:"invalid_request"});
  await expect(dispatch()).resolves.toEqual({status:"uncertain",reasonClass:"unknown_dispatched_outcome"});
  expect(fixture.state).toMatchObject({attemptStatus:"uncertain",holdStatus:"held",aiStatus:"running",lockedBy:"syn-owner"});
  expect(fixture.refusalCounts).toEqual([]);expect(fixture.succeedCalls).not.toHaveBeenCalled();
  expect(fixture.state.auditEvents).not.toContain("model_gateway.spend.released");
 });
 it("only one of two concurrent refusals may finalize and release",async()=>{
  const results=await Promise.all([dispatch(false),dispatch(false)]);
  expect(results).toEqual([{status:"refused",reasonClass:"rollout_disabled"},{status:"superseded",reasonClass:"attempt_claim_lost"}]);
  expect(fixture.refusalCounts).toEqual([1,0]);
  expect(fixture.effects.filter(effect=>effect==="hold-release")).toHaveLength(1);
  expect(fixture.effects.filter(effect=>effect==="ai-fence")).toHaveLength(1);
  expect(fixture.state.auditEvents).toHaveLength(2);expect(fixture.dispatch).not.toHaveBeenCalled();
 });
 it("a refusal winning the race prevents a stale prepared reader from dispatching",async()=>{
  fixture.query.mockResolvedValue(lineage());
  const results=await Promise.all([dispatch(false),dispatch()]);
  expect(results).toEqual([{status:"refused",reasonClass:"rollout_disabled"},{status:"superseded",reasonClass:"attempt_claim_lost"}]);
  expect(fixture.state).toMatchObject({attemptStatus:"cancelled_before_dispatch",holdStatus:"released",gatewayStatus:"refused"});
  expect(fixture.credentialCalls).not.toHaveBeenCalled();expect(fixture.dispatch).not.toHaveBeenCalled();
 });
 it("a failed dispatch audit rolls back the claim and never resolves credentials",async()=>{
  const snapshot=structuredClone(fixture.state);fixture.failAudit=true;
  await expect(dispatch()).rejects.toThrow("SYNTHETIC_AUDIT_FAILURE");
  expect(fixture.state).toEqual(snapshot);expect(fixture.credentialCalls).not.toHaveBeenCalled();expect(fixture.dispatch).not.toHaveBeenCalled();
 });
});
