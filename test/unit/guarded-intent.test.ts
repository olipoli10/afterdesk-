import { describe, expect, it, vi } from "vitest";
import { inspectGuardedIntentAdmission, segmentGuardedIntentSource, inspectGuardedIntentProposal, type GuardedIntentSnapshot } from "@/server/model-gateway/guarded-intent";

const source = "Texte syn-c1 : Mesurer.";
const readSource = "Qu'est-ce que j'ai demain?";
const metadata = {
  schemaVersion: 1, requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", workspaceId: "syn-workspace", actorId: "syn-owner",
  channel: "VOICE_TRANSCRIPT", declaredDataClass: "business_confidential", privacyRequirement: "no_training",
  riskClass: "medium", maxTotalCostMicros: 100_000, policyKey: "assistant-routing-r36a-v1", acceptedAt: "2026-09-09T12:00:00Z",
};
function context(): GuardedIntentSnapshot {
  return {
    workspaceId: "syn-workspace", actorId: "syn-owner", role: "OWNER", permissionRevision: "permissions-1", contextRevision: "context-1",
    policy: { dataClassFloor:"business_confidential",privacyFloor:"no_training",riskFloor:"medium",budgetCeilingMicros:100_000,acceptedAt:metadata.acceptedAt },
    allowedOperations: ["READ_CONTACT", "READ_CALENDAR", "READ_TASK", "DRAFT_MESSAGE", "PREPARE_EVENT", "PREPARE_TASK", "PREPARE_NOTE"],
    entities: [
      { id: "syn-c1", workspaceId: "syn-workspace", kind: "CONTACT", aliases: ["Alex", "Responsable nord"], allowedRoles: ["OWNER", "FIELD_WORKER", "VIEWER"] },
      { id: "syn-c2", workspaceId: "syn-workspace", kind: "CONTACT", aliases: ["Alex"], allowedRoles: ["OWNER"] },
    ],
    evidence: [{ id: "syn-evidence", workspaceId: "syn-workspace", kind: "SERVER_RECORD", observedAt: "2026-09-09T12:00:00Z", contentFingerprint: `sha256:${"a".repeat(64)}`,classification:"OPERATIONAL",allowedRoles:["OWNER","FIELD_WORKER","VIEWER"] }],
    facts: [{ id: "syn-fact", evidenceId: "syn-evidence", value: "3", classification: "OPERATIONAL", allowedRoles: ["OWNER", "FIELD_WORKER"] }],
  };
}
function proposal(ctx = context(), text = source) {
  const admission = inspectGuardedIntentAdmission(metadata, ctx, text);
  return {
    schemaVersion: 1, requestFingerprint: admission.requestFingerprint, contextFingerprint: admission.contextFingerprint,
    actions: [{ id: "syn-action1", operation: "DRAFT_MESSAGE", targets: [{kind:"CONTACT",reference:"syn-c1"}] as Array<{kind:string;reference:string}>,
      fields: [{ name: "body", proposedValue: "Mesurer", provenance: "MODEL_PROPOSED", sourceSpans: [] as Array<{start:number;end:number;quote:string}> }],
      evidenceIds: ["syn-evidence"], dependsOn: [] as string[] }],
    factClaims: [{ factId: "syn-fact", evidenceId: "syn-evidence", value: "3" }],
  };
}
const validate = (value: unknown, ctx = context(), text = source) => inspectGuardedIntentProposal(JSON.stringify(value), metadata, ctx, text);

describe("guarded intent local disabled proposal boundary", () => {
  it("GI001 does not promote a canonical read request into task creation", () => {
    const text="Qu'est-ce que j'ai demain?";
    expect(validate(proposal(context(),text),context(),text)).toMatchObject({status:"CLARIFICATION_REQUIRED",preview:null});
  });
  it("GI002 never emits an authorized preview from an unchanged caller-supplied cache", () => {
    const cached=context();const value=proposal(cached);
    // The pure function cannot observe a permission revocation elsewhere.
    expect(validate(value,cached)).toMatchObject({status:"PROPOSAL_INSPECTED_NOT_AUTHORIZED",preview:null,snapshotAuthority:"UNVERIFIED_CALLER_SNAPSHOT"});
  });
  it("GI003 rejects financial evidence access even when its fact claim is omitted", () => {
    const ctx=context();ctx.role="FIELD_WORKER";ctx.facts[0].classification="FINANCIAL";
    const text="Qu'est-ce que j'ai demain?";const value=proposal(ctx,text);value.factClaims=[];
    value.actions[0]={...value.actions[0],operation:"READ_CONTACT",targets:[{kind:"CONTACT",reference:"syn-c1"}],fields:[]};
    expect(validate(value,ctx,text)).toMatchObject({status:"REJECTED",reason:"EVIDENCE_NOT_PERMITTED"});
  });
  it("GI004 rejects multiplicative work across repeated action-target pairs", () => {
    const ctx=context();const text="Qu'est-ce que j'ai demain?";const value=proposal(ctx,text);
    value.actions=Array.from({length:10},(_,i)=>({...value.actions[0],id:`syn-a${i}`,operation:"READ_CONTACT",targets:[{kind:"CONTACT",reference:"syn-c1"},{kind:"CONTACT",reference:"syn-c2"}],fields:[]}));
    expect(validate(value,ctx,text).status).toBe("REJECTED");
  });
  it("GI005 hashes set-like context independently from member ordering", () => {
    const ctx=context();const reordered=structuredClone(ctx);
    reordered.allowedOperations.reverse();reordered.entities.reverse();reordered.entities.forEach(entity=>{entity.aliases.reverse();entity.allowedRoles.reverse();});reordered.facts[0].allowedRoles.reverse();
    expect(inspectGuardedIntentAdmission(metadata,reordered,source).contextFingerprint).toBe(inspectGuardedIntentAdmission(metadata,ctx,source).contextFingerprint);
  });
  it("GI006 does not accept a caller policy downgrade or budget increase", () => {
    const ctx=context();
    expect(()=>inspectGuardedIntentAdmission({...metadata,declaredDataClass:"public",privacyRequirement:"standard",maxTotalCostMicros:999_999},ctx,source)).toThrow();
  });
  it("GI005 canonicalizes evidence, facts, roles and fact-claim order", () => {
    const ctx=context();ctx.evidence.push({...ctx.evidence[0],id:"syn-evidence2"});ctx.facts.push({...ctx.facts[0],id:"syn-fact2",evidenceId:"syn-evidence2",value:"4"});
    const value=proposal(ctx);value.factClaims.push({factId:"syn-fact2",evidenceId:"syn-evidence2",value:"4"});value.actions[0].evidenceIds.push("syn-evidence2");
    const first=validate(value,ctx);
    const reordered=structuredClone(ctx);reordered.evidence.reverse();reordered.facts.reverse();reordered.evidence.forEach(item=>item.allowedRoles.reverse());
    value.factClaims.reverse();value.actions[0].evidenceIds.reverse();
    expect(validate(value,reordered)).toEqual(first);
  });
  it("GI003 hides missing and denied evidence and requires an authorized checked fact", () => {
    const ctx=context();const value=proposal(ctx);value.factClaims=[];
    ctx.evidence[0].allowedRoles=[];
    const denied=validate(proposal(ctx),ctx);
    expect(denied).toMatchObject({reason:"EVIDENCE_NOT_PERMITTED",preview:null});
    const missing=proposal();missing.actions[0].evidenceIds=["syn-missing"];
    expect(validate(missing)).toMatchObject({reason:"EVIDENCE_NOT_PERMITTED",preview:null});
    expect(validate({...proposal(),factClaims:[]})).toMatchObject({reason:"EVIDENCE_NOT_PERMITTED"});
  });
  it("GI006 enforces each code-owned floor even if the supplied policy is downgraded too", () => {
    const ctx=context();ctx.policy.dataClassFloor="public";ctx.policy.privacyFloor="standard";ctx.policy.riskFloor="low";
    for(const changed of [{declaredDataClass:"public"},{privacyRequirement:"standard"},{riskClass:"low"},{maxTotalCostMicros:100_001},{acceptedAt:"2026-09-09T13:00:00Z"}]){
      expect(()=>inspectGuardedIntentAdmission({...metadata,...changed},ctx,source)).toThrow("POLICY_FLOOR_MISMATCH");
    }
    ctx.policy.dataClassFloor="restricted_sensitive";
    expect(()=>inspectGuardedIntentAdmission(metadata,ctx,source)).toThrow("POLICY_FLOOR_MISMATCH");
  });
  it("GI001 does not make a model-candidate reasoning disposition action-capable", () => {
    const text="Analyse les étapes du chantier.";const value=proposal(context(),text);
    const admission=inspectGuardedIntentAdmission(metadata,context(),text);
    expect(admission.baselineDecisions[0]).toMatchObject({intentClass:"COMPLEX_REASONING",capabilityKey:"CONTROLLER_REASONING",disposition:"CANDIDATE_PREPARED",riskClass:"medium"});
    expect(validate(value,context(),text)).toMatchObject({status:"CLARIFICATION_REQUIRED",reasons:["CAPABILITY_OPERATION_MISMATCH"],preview:null});
  });
  it("GI004 rejects repeated operation-target pairs even below the total ceiling", () => {
    const value=proposal();value.actions.push({...value.actions[0],id:"syn-action2"});
    expect(validate(value)).toMatchObject({status:"REJECTED",reason:"REPEATED_OPERATION_TARGET",preview:null});
  });
  it("inspects a deeply frozen proposal without emitting any authorized preview or provider call", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = validate(proposal());
    expect(result).toMatchObject({ status: "PROPOSAL_INSPECTED_NOT_AUTHORIZED", candidateAccess: "UNPROBED", candidateModelKey: null, executionAuthorized: false, approvalGranted: false, semanticTruthVerified: false, canonicalAnswer: null });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.preview).toBeNull();
    if (result.status === "PROPOSAL_INSPECTED_NOT_AUTHORIZED") {
      expect(Object.isFrozen(result.inspection.actions[0].fields[0])).toBe(true);
      expect(result.inspection.checkedFactRefs[0].consistency).toBe("MATCHES_SUPPLIED_SNAPSHOT");
      expect(result.inspection.actions[0].fields[0].verification).toBe("UNVERIFIED_PROPOSAL");
    }
  });
  it("normalizes property order without treating the fingerprint as an approval", () => {
    const original = proposal();
    const reordered = Object.fromEntries(Object.entries(original).reverse());
    expect(validate(reordered)).toEqual(validate(original));
    original.actions[0].fields[0].proposedValue = "Fermer";
    const changed = validate(original), baseline = validate(proposal());
    expect(changed.status).toBe("PROPOSAL_INSPECTED_NOT_AUTHORIZED");
    if (changed.status === "PROPOSAL_INSPECTED_NOT_AUTHORIZED" && baseline.status === "PROPOSAL_INSPECTED_NOT_AUTHORIZED") expect(changed.inspectionFingerprint).not.toBe(baseline.inspectionFingerprint);
  });
  it.each(["executionAuthorized", "approvalGranted", "provider", "endpoint", "modelKey", "fallback", "canonicalAnswer"])("rejects model authority/config field %s", key => {
    expect(validate({ ...proposal(), [key]: true })).toMatchObject({ status: "REJECTED", preview: null, executionAuthorized: false });
  });
  it("rejects malformed and oversized JSON without echoing its content", () => {
    expect(inspectGuardedIntentProposal("{private-content", metadata, context(), source)).toMatchObject({status:"REJECTED",reason:"INVALID_PROPOSAL_OR_CONTEXT"});
    expect(inspectGuardedIntentProposal(" ".repeat(64_001), metadata, context(), source)).toMatchObject({reason:"PROPOSAL_LIMIT_EXCEEDED"});
  });
  it.each(["permissionRevision", "contextRevision", "role"])("rejects stale trusted %s", key => {
    const ctx = context(), value = proposal(ctx);
    const changed = { ...ctx, [key]: key === "role" ? "VIEWER" : "revised" };
    expect(validate(value, changed as GuardedIntentSnapshot)).toMatchObject({reason:"STALE_CONTEXT_OR_PERMISSION"});
  });
  it("rejects request/source mutation and identity substitution", () => {
    expect(validate(proposal(), context(), source + " Correction.")).toMatchObject({reason:"REQUEST_FINGERPRINT_MISMATCH"});
    expect(validate(proposal(), {...context(), actorId:"syn-other"})).toMatchObject({reason:"CONTEXT_IDENTITY_MISMATCH"});
  });
  it("refuses cross-workspace and duplicate trusted entities", () => {
    const ctx = context(); ctx.entities[0].workspaceId = "syn-other";
    expect(() => inspectGuardedIntentAdmission(metadata, ctx, source)).toThrow("CROSS_WORKSPACE_CONTEXT");
    ctx.entities[0].workspaceId = "syn-workspace"; ctx.entities.push(ctx.entities[0]);
    expect(() => inspectGuardedIntentAdmission(metadata, ctx, source)).toThrow("DUPLICATE_CONTEXT_IDENTIFIER");
  });
  it("clarifies homonyms and unknown entities without returning a partial preview", () => {
    const value = proposal(context(),readSource); value.actions[0] = {...value.actions[0], operation:"READ_CONTACT", fields:[], targets:[{kind:"CONTACT",reference:"Alex"}]};
    expect(validate(value,context(),readSource)).toMatchObject({status:"CLARIFICATION_REQUIRED", reasons:["AMBIGUOUS_ENTITY"], preview:null});
    value.actions[0].targets[0].reference = "inconnu";
    expect(validate(value,context(),readSource)).toMatchObject({status:"CLARIFICATION_REQUIRED",reasons:["UNKNOWN_OR_INACCESSIBLE_ENTITY"]});
    value.actions[0].targets[0].reference = "syn-c1";
    const result=validate(value,context(),readSource);
    expect(result.status).toBe("PROPOSAL_INSPECTED_NOT_AUTHORIZED");
    if(result.status === "PROPOSAL_INSPECTED_NOT_AUTHORIZED") expect(result.inspection.actions[0].targetIds).toEqual(["syn-c1"]);
  });
  it("keeps known-but-inaccessible entities indistinguishable from missing entities", () => {
    const ctx=context();ctx.role="FIELD_WORKER";
    const value=proposal(ctx,readSource);value.actions[0]={...value.actions[0],operation:"READ_CONTACT",fields:[],targets:[{kind:"CONTACT",reference:"syn-c2"}]};
    expect(validate(value,ctx,readSource)).toMatchObject({status:"CLARIFICATION_REQUIRED",reasons:["UNKNOWN_OR_INACCESSIBLE_ENTITY"]});
  });
  it("caps unique recipients across actions, not just per action", () => {
    const ctx=context();ctx.entities=Array.from({length:11},(_,i)=>({...ctx.entities[0],id:`syn-c${i}`,aliases:[]}));
    const value=proposal(ctx);value.actions=[0,1].map((n)=>({...value.actions[0],id:`syn-action${n}`,operation:"DRAFT_MESSAGE",fields:[{name:"body",proposedValue:"reçu",provenance:"MODEL_PROPOSED",sourceSpans:[]}],targets:ctx.entities.slice(n*6,n*6+6).map(entity=>({kind:"CONTACT",reference:entity.id}))}));
    expect(validate(value,ctx)).toMatchObject({reason:"TOTAL_WORK_LIMIT_EXCEEDED"});
    value.actions[1].targets.pop(); expect(validate(value,ctx).status).toBe("PROPOSAL_INSPECTED_NOT_AUTHORIZED");
  });
  it("caps ten actions and rejects duplicate action identifiers", () => {
    const ctx=context();ctx.entities=Array.from({length:11},(_,i)=>({...ctx.entities[0],id:`syn-c${i}`,aliases:[]}));
    const value=proposal(ctx);value.actions=Array.from({length:11},(_,i)=>({...value.actions[0],id:`syn-action${i}`,targets:[{kind:"CONTACT",reference:`syn-c${i}`}]}));
    expect(validate(value,ctx).status).toBe("REJECTED");
    value.actions=value.actions.slice(0,10);expect(validate(value,ctx).status).toBe("PROPOSAL_INSPECTED_NOT_AUTHORIZED");
    value.actions[1].id=value.actions[0].id;expect(validate(value,ctx)).toMatchObject({reason:"DUPLICATE_ACTION_ID"});
  });
  it("allows only a prior-action DAG and rejects self/forward/cyclic dependencies", () => {
    const value=proposal();value.actions.push({...value.actions[0],id:"syn-action2",targets:[{kind:"CONTACT",reference:"syn-c2"}],dependsOn:["syn-action1"]});
    expect(validate(value).status).toBe("PROPOSAL_INSPECTED_NOT_AUTHORIZED");
    value.actions[0].dependsOn=["syn-action2"];expect(validate(value)).toMatchObject({reason:"DEPENDENCY_NOT_PRIOR_ACTION"});
    value.actions[0].dependsOn=["syn-action1"];expect(validate(value)).toMatchObject({reason:"DEPENDENCY_NOT_PRIOR_ACTION"});
  });
  it("rejects unregistered operations, missing fields, forbidden permission and viewer mutation", () => {
    const value=proposal();value.actions[0].operation="SEND_SMS";expect(validate(value).status).toBe("REJECTED");
    value.actions[0].operation="PREPARE_TASK";value.actions[0].fields=[];expect(validate(value)).toMatchObject({reason:"OPERATION_FIELDS_INVALID"});
    const ctx=context();ctx.allowedOperations=[];expect(validate(proposal(ctx),ctx)).toMatchObject({reason:"OPERATION_NOT_PERMITTED"});
    ctx.allowedOperations=["DRAFT_MESSAGE"];ctx.role="VIEWER";ctx.facts=[];
    const viewer=proposal(ctx);viewer.factClaims=[];expect(validate(viewer,ctx)).toMatchObject({reason:"ROLE_NOT_PERMITTED"});
  });
  it("binds quotes to exact original offsets without asserting truth", () => {
    const value=proposal();const start=source.indexOf("Mesurer");
    value.actions[0].fields[0]={name:"body",proposedValue:"Mesurer",provenance:"USER_QUOTED",sourceSpans:[{start,end:start+7,quote:"Mesurer"}]};
    expect(validate(value).status).toBe("PROPOSAL_INSPECTED_NOT_AUTHORIZED");
    value.actions[0].fields[0].sourceSpans[0].start++;expect(validate(value)).toMatchObject({reason:"SOURCE_SPAN_MISMATCH"});
  });
  it("rejects invented facts, wrong values, wrong citations and field-worker finance", () => {
    const value=proposal();value.factClaims[0].value="999";expect(validate(value)).toMatchObject({reason:"FACT_CLAIM_MISMATCH"});
    value.factClaims[0].factId="invented";expect(validate(value)).toMatchObject({reason:"FACT_NOT_PERMITTED"});
    const ctx=context();ctx.role="FIELD_WORKER";ctx.facts[0].classification="FINANCIAL";
    expect(validate(proposal(ctx),ctx)).toMatchObject({reason:"FACT_NOT_PERMITTED"});
    const wrong=proposal();wrong.actions[0].evidenceIds=["invented"];expect(validate(wrong)).toMatchObject({reason:"EVIDENCE_NOT_PERMITTED"});
  });
  it("does not override a refusal or mixed-intent clarification from baseline R36a", () => {
    const mixed="Recherche une entreprise et envoie un message.";
    expect(validate(proposal(context(),mixed),context(),mixed)).toMatchObject({status:"CLARIFICATION_REQUIRED",reasons:expect.arrayContaining(["BASELINE_CLARIFICATION_REQUIRED"])});
    const restricted="Recherche un numéro d'assurance sociale.";
    expect(validate(proposal(context(),restricted),context(),restricted)).toMatchObject({reason:"BASELINE_NOT_ELIGIBLE"});
  });
  it("checks temporal shape and duration without claiming calendar availability or DST truth", () => {
    const text="Ajoute un rendez-vous demain à 14 h.";
    const value=proposal(context(),text);value.actions[0].operation="PREPARE_EVENT";value.actions[0].targets=[];
    value.actions[0].fields=["title","start","durationMinutes"].map((name,i)=>({name,proposedValue:["Visite","2026-09-10T14:00:00-04:00","30"][i],provenance:"MODEL_PROPOSED",sourceSpans:[]}));
    expect(validate(value,context(),text).status).toBe("PROPOSAL_INSPECTED_NOT_AUTHORIZED");
    value.actions[0].fields[1].proposedValue="demain";expect(validate(value,context(),text)).toMatchObject({reason:"EVENT_TIME_INVALID"});
    value.actions[0].fields[1].proposedValue="2026-09-10T14:00:00-04:00";
    value.actions[0].fields[2].proposedValue="-30";expect(validate(value,context(),text)).toMatchObject({reason:"EVENT_DURATION_INVALID"});
  });
  it("preserves every source code unit and surrogate pair without claiming combined understanding", () => {
    const text="Analyse "+"x".repeat(3991)+"😀"+" Analyse. ".repeat(1100)+" Correction finale : Fermer.";
    const segmented=segmentGuardedIntentSource(text);
    expect(segmented.segments.map(segment=>segment.text).join("")).toBe(text);
    for(const segment of segmented.segments){expect(text.slice(segment.start,segment.end)).toBe(segment.text);expect(segment.text.length).toBeLessThanOrEqual(4000);expect(/[\uD800-\uDBFF]$/u.test(segment.text)).toBe(false);}
    expect(validate(proposal(context(),text),context(),text)).toMatchObject({status:"CLARIFICATION_REQUIRED",reasons:expect.arrayContaining(["LONG_INPUT_REQUIRES_AGGREGATE_REVIEW"]),preview:null});
    expect(()=>segmentGuardedIntentSource("x".repeat(64_001))).toThrow("SOURCE_LIMIT_EXCEEDED");
    expect(()=>segmentGuardedIntentSource("Analyse \uD83D")).toThrow("SOURCE_UNICODE_INVALID");
  });
});
