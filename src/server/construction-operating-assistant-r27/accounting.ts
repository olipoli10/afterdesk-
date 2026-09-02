import "server-only";

import { Prisma } from "@prisma-client";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  accountingAccountCommandSchema,
  accountingAccountResultSchema,
  accountingCockpitSchema,
  accountingDraftResultSchema,
  accountingObservationResultSchema,
  approveAccountingDraftCommandSchema,
  normalizedAccountingObservationSchema,
  prepareAccountingDraftCommandSchema,
  type AccountingDraftResult,
  type ApproveAccountingDraftCommand,
} from "@/lib/construction-operating-assistant-r27/contracts";
import {
  accountingDraftPayloadHash,
  accountingObservationHash,
  classifyAccountingMatch,
} from "@/lib/construction-operating-assistant-r27/policy";
import { prisma } from "@/lib/db";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

export class AccountingConflict extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AccountingConflict";
  }
}

type Tx = Prisma.TransactionClient;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function jsonRecord(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountingConflict("ACCOUNTING_PAYLOAD_INVALID");
  }
  return value as Record<string, unknown>;
}

async function lock(tx: Tx, key: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r27:${key}`}, 0))::text AS acquired
  `);
}

async function requireOffice(tx: Tx, userId: string, workspaceId: string) {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (membership.role === "member") throw new ConstructionAccessDenied();
  return membership;
}

function policyRefusalCode(error: unknown) {
  if (error instanceof AccountingConflict) return error.code;
  if (error instanceof ConstructionAccessDenied) return "ACCOUNTING_ACCESS_DENIED";
  return null;
}

async function withAccountingRefusal<T>(input: {
  workspaceId: string;
  operationId: string;
  operationKind: string;
  inputHash: string;
  actorId: string;
}, operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    const refusalCode = policyRefusalCode(error);
    if (refusalCode) {
      const authorized = await prisma.constructionWorkspaceMember.findFirst({
        where: { workspaceId: input.workspaceId, userId: input.actorId, status: "active" },
        select: { id: true },
      }).catch(() => null);
      if (authorized) {
        await prisma.constructionAccountingRefusal.create({
          data: { ...input, refusalCode },
        }).catch(() => null);
      }
    }
    throw error;
  }
}

async function existingDecision(tx: Tx, workspaceId: string, commandId: string, commandHash: string) {
  const decision = await tx.constructionAccountingDecision.findUnique({
    where: {workspaceId_commandId:{workspaceId,commandId}},
    select: {commandHash:true,result:true},
  });
  if (!decision) return null;
  if (decision.commandHash !== commandHash) throw new AccountingConflict("ACCOUNTING_COMMAND_IDEMPOTENCY_CONFLICT");
  return decision.result;
}

async function saveDecision(tx: Tx, input: {
  workspaceId:string; commandId:string; commandHash:string; entityType:string; entityId:string;
  action:string; stateBefore:string|null; stateAfter:string; result:unknown; actorId:string;
}) {
  await tx.constructionAccountingDecision.create({data:{...input,result:asJson(input.result)}});
}

function accountResult(input: {
  commandId:string; workspaceId:string; account:{id:string;provider:string;status:string;version:number;capabilities:string[]}; replayed:boolean;
}) {
  return accountingAccountResultSchema.parse({
    schemaVersion:1, commandId:input.commandId, workspaceId:input.workspaceId,
    accountId:input.account.id, provider:input.account.provider, status:input.account.status,
    version:input.account.version, capabilities:input.account.capabilities,
    replayed:input.replayed, credentialStored:false, externalWriteEnabled:false,
  });
}

export async function processAccountingAccountCommand(input: {userId:string;command:unknown}) {
  const command = accountingAccountCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return withAccountingRefusal({workspaceId:command.workspaceId,operationId:command.commandId,
    operationKind:command.action,inputHash:commandHash,actorId:input.userId},()=>prisma.$transaction(async (tx) => {
    await lock(tx, `${command.workspaceId}:command:${command.commandId}`);
    await requireOffice(tx,input.userId,command.workspaceId);
    const replay = await existingDecision(tx,command.workspaceId,command.commandId,commandHash);
    if (replay) return accountingAccountResultSchema.parse({...accountingAccountResultSchema.parse(replay),replayed:true});
    if (command.action === "PREPARE_ACCOUNTING_ACCOUNT") {
      await lock(tx,`${command.workspaceId}:account:${command.provider}:${command.accountRef}`);
      const found = await tx.constructionAccountingAccount.findUnique({
        where:{workspaceId_provider_accountRef:{workspaceId:command.workspaceId,provider:command.provider,accountRef:command.accountRef}},
      });
      const capabilities = [...command.capabilities].sort();
      const account = found
        ? await tx.constructionAccountingAccount.update({where:{id:found.id},data:{
            tenantRef:command.tenantRef,capabilities,status:"PREPARED_DISABLED",version:{increment:1},
            cursorRef:null,cursorVersion:0,credentialStored:false,externalWriteEnabled:false,
            preparedByUserId:input.userId,revokedAt:null,
          }})
        : await tx.constructionAccountingAccount.create({data:{
            workspaceId:command.workspaceId,provider:command.provider,accountRef:command.accountRef,
            tenantRef:command.tenantRef,capabilities,status:"PREPARED_DISABLED",credentialStored:false,
            externalWriteEnabled:false,preparedByUserId:input.userId,
          }});
      const result = accountResult({commandId:command.commandId,workspaceId:command.workspaceId,account,replayed:false});
      await saveDecision(tx,{workspaceId:command.workspaceId,commandId:command.commandId,commandHash,
        entityType:"ACCOUNT",entityId:account.id,action:command.action,stateBefore:found?.status ?? null,
        stateAfter:account.status,result,actorId:input.userId});
      return result;
    }
    await lock(tx,`${command.workspaceId}:account:${command.accountId}`);
    const account = await tx.constructionAccountingAccount.findFirst({where:{id:command.accountId,workspaceId:command.workspaceId}});
    if (!account) throw new ConstructionAccessDenied();
    if (account.version !== command.expectedVersion) throw new AccountingConflict("ACCOUNTING_ACCOUNT_VERSION_CONFLICT");
    if (account.status === "REVOKED") throw new AccountingConflict("ACCOUNTING_ACCOUNT_ALREADY_REVOKED");
    const revoked = await tx.constructionAccountingAccount.update({where:{id:account.id},data:{
      status:"REVOKED",version:{increment:1},cursorRef:null,cursorVersion:0,revokedAt:new Date(),
      credentialStored:false,externalWriteEnabled:false,
    }});
    const result = accountResult({commandId:command.commandId,workspaceId:command.workspaceId,account:revoked,replayed:false});
    await saveDecision(tx,{workspaceId:command.workspaceId,commandId:command.commandId,commandHash,
      entityType:"ACCOUNT",entityId:account.id,action:command.action,stateBefore:account.status,
      stateAfter:revoked.status,result,actorId:input.userId});
    return result;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5_000,timeout:15_000}));
}

function observationResult(row: {
  observationId:string; id:string; workspaceId:string; receivableId:string|null; projectId:string|null;
  matchStatus:string; matchReason:string;
}, replayed:boolean) {
  return accountingObservationResultSchema.parse({
    schemaVersion:1,observationId:row.observationId,accountingObservationId:row.id,
    workspaceId:row.workspaceId,receivableId:row.receivableId,projectId:row.projectId,
    matchStatus:row.matchStatus,matchReason:row.matchReason,replayed,
    canonicalEffectApplied:false,externalWritePerformed:false,
  });
}

export async function admitAccountingObservation(input: {userId:string;observation:unknown}) {
  const observation = normalizedAccountingObservationSchema.parse(input.observation);
  const contentHash = accountingObservationHash(observation);
  return withAccountingRefusal({workspaceId:observation.workspaceId,operationId:observation.observationId,
    operationKind:`ADMIT_${observation.kind}`,inputHash:contentHash,actorId:input.userId},()=>prisma.$transaction(async (tx) => {
    await lock(tx,`${observation.workspaceId}:observation:${observation.observationId}`);
    await requireOffice(tx,input.userId,observation.workspaceId);
    const replay = await tx.constructionAccountingObservation.findUnique({
      where:{workspaceId_observationId:{workspaceId:observation.workspaceId,observationId:observation.observationId}},
    });
    if (replay) {
      if (replay.contentHash !== contentHash) throw new AccountingConflict("ACCOUNTING_OBSERVATION_IDEMPOTENCY_CONFLICT");
      return observationResult(replay,true);
    }
    await lock(tx,`${observation.workspaceId}:entity:${observation.accountId}:${observation.entityRef}`);
    const identityReplay = await tx.constructionAccountingObservation.findUnique({
      where:{accountId_entityRef:{accountId:observation.accountId,entityRef:observation.entityRef}},
    });
    if (identityReplay) {
      if (identityReplay.contentHash !== contentHash) throw new AccountingConflict("ACCOUNTING_ENTITY_DRIFT");
      return observationResult(identityReplay,true);
    }
    const account = await tx.constructionAccountingAccount.findFirst({where:{
      id:observation.accountId,workspaceId:observation.workspaceId,provider:observation.provider,status:"PREPARED_DISABLED",
    }});
    if (!account) throw new ConstructionAccessDenied();
    const needed = observation.kind === "PAYMENT" ? "READ_PAYMENTS" : "READ_RECEIVABLES";
    if (!account.capabilities.includes(needed)) throw new AccountingConflict("ACCOUNTING_CAPABILITY_MISSING");
    if (observation.projectId) {
      const project = await tx.constructionProject.findFirst({where:{id:observation.projectId,workspaceId:observation.workspaceId,status:"active"},select:{id:true}});
      if (!project) throw new ConstructionAccessDenied();
    }
    if (observation.contactId) {
      const contact = await tx.constructionContact.findFirst({where:{id:observation.contactId,workspaceId:observation.workspaceId,status:"active"},select:{id:true}});
      if (!contact) throw new ConstructionAccessDenied();
    }
    let receivableId:string|null = null;
    let projectId = observation.projectId;
    let matchStatus:"EXACT"|"PARTIAL"|"UNMATCHED"|"AMBIGUOUS"|"OVERPAYMENT"|"CONFLICT_REQUIRES_REVIEW" = "UNMATCHED";
    let matchReason = "RECEIVABLE_NOT_SUPPLIED";
    if (observation.receivableId) {
      const receivable = await tx.constructionReceivable.findFirst({where:{id:observation.receivableId,workspaceId:observation.workspaceId}});
      if (!receivable) throw new ConstructionAccessDenied();
      const classified = classifyAccountingMatch({
        kind:observation.kind,observationCurrency:observation.currency,receivableCurrency:receivable.currency,
        amountMinor:observation.amountMinor,originalAmountMinor:receivable.originalAmountMinor,
        outstandingAmountMinor:receivable.outstandingAmountMinor,
        projectMatches:observation.projectId === receivable.projectId,
        contactMatches:observation.contactId === receivable.contactId,
        receivableStatus:receivable.status,
      });
      receivableId = receivable.id;
      projectId = receivable.projectId;
      matchStatus = classified.status;
      matchReason = classified.reason;
    }
    const row = await tx.constructionAccountingObservation.create({data:{
      workspaceId:observation.workspaceId,accountId:observation.accountId,observationId:observation.observationId,
      provider:observation.provider,entityRef:observation.entityRef,cursorRef:observation.cursorRef,kind:observation.kind,
      projectId,contactId:observation.contactId,receivableId,documentNumberHash:observation.documentNumberHash,
      amountMinor:observation.amountMinor,currency:observation.currency,observedStatus:observation.observedStatus,
      suppliedAt:new Date(observation.suppliedAt),contentHash,
      adapterFingerprint:sha256Canonical(observation.adapter),matchStatus,matchReason,
      canonicalEffectApplied:false,externalWritePerformed:false,
    }});
    await tx.constructionAccountingAccount.update({where:{id:account.id},data:{
      cursorRef:observation.cursorRef,cursorVersion:{increment:1},version:{increment:1},
    }});
    return observationResult(row,false);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5_000,timeout:15_000}));
}

function draftResult(row: {
  id:string;workspaceId:string;kind:string;provider:string;receivableId:string;observationId:string|null;
  version:number;payload:Prisma.JsonValue;payloadHash:string;status:string;canonicalEffectApplied:boolean;
}, commandId:string, replayed:boolean): AccountingDraftResult {
  return accountingDraftResultSchema.parse({
    schemaVersion:1,commandId,draftId:row.id,workspaceId:row.workspaceId,kind:row.kind,
    provider:row.provider,receivableId:row.receivableId,observationId:row.observationId,
    version:row.version,payload:jsonRecord(row.payload),payloadHash:row.payloadHash,status:row.status,
    canonicalEffectApplied:row.canonicalEffectApplied,externalEffectCount:0,replayed,externalWritePerformed:false,
  });
}

export async function prepareAccountingDraft(input: {userId:string;command:unknown}) {
  const command = prepareAccountingDraftCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return withAccountingRefusal({workspaceId:command.workspaceId,operationId:command.commandId,
    operationKind:command.action,inputHash:commandHash,actorId:input.userId},()=>prisma.$transaction(async (tx) => {
    await lock(tx,`${command.workspaceId}:command:${command.commandId}`);
    await requireOffice(tx,input.userId,command.workspaceId);
    const replay = await existingDecision(tx,command.workspaceId,command.commandId,commandHash);
    if (replay) return accountingDraftResultSchema.parse({...accountingDraftResultSchema.parse(replay),replayed:true});
    const account = await tx.constructionAccountingAccount.findFirst({where:{id:command.accountId,workspaceId:command.workspaceId,status:"PREPARED_DISABLED"}});
    if (!account) throw new ConstructionAccessDenied();
    const needed = command.action === "PREPARE_ACCOUNTING_INVOICE" ? "PREPARE_INVOICE" : "PREPARE_RECONCILIATION";
    if (!account.capabilities.includes(needed)) throw new AccountingConflict("ACCOUNTING_CAPABILITY_MISSING");
    await lock(tx,`${command.workspaceId}:receivable:${command.receivableId}`);
    const receivable = await tx.constructionReceivable.findFirst({where:{id:command.receivableId,workspaceId:command.workspaceId},include:{openLoop:{select:{id:true,status:true,stateVersion:true,decisionHash:true}}}});
    if (!receivable) throw new ConstructionAccessDenied();
    if (receivable.version !== command.expectedReceivableVersion) throw new AccountingConflict("RECEIVABLE_VERSION_CONFLICT");
    let kind:"INVOICE"|"RECONCILIATION";
    let observationId:string|null = null;
    let selectedEvidenceIds:string[] = [];
    let payload:Record<string,unknown>;
    if (command.action === "PREPARE_ACCOUNTING_INVOICE") {
      if (!receivable.openLoop || receivable.openLoop.status !== "ready_to_invoice") throw new AccountingConflict("RECEIVABLE_SOURCE_NOT_INVOICE_READY");
      const total = command.lines.reduce((sum,line)=>sum+(line.quantity*line.unitAmountMinor)+line.taxAmountMinor,0);
      if (!Number.isSafeInteger(total) || total !== receivable.originalAmountMinor) throw new AccountingConflict("ACCOUNTING_INVOICE_TOTAL_MISMATCH");
      if (command.selectedEvidenceIds.length) {
        const evidenceCount = await tx.constructionOpenLoopEvidence.count({where:{
          id:{in:command.selectedEvidenceIds},loopId:receivable.openLoop.id,workspaceId:command.workspaceId,
          projectId:receivable.projectId,state:{in:["present_unverified","verified"]},
        }});
        if (evidenceCount !== new Set(command.selectedEvidenceIds).size) throw new ConstructionAccessDenied();
      }
      kind = "INVOICE";
      selectedEvidenceIds = [...new Set(command.selectedEvidenceIds)].sort();
      payload = {
        provider:account.provider,projectId:receivable.projectId,contactId:receivable.contactId,
        receivableId:receivable.id,invoiceReference:receivable.invoiceReference,currency:receivable.currency,
        amountMinor:receivable.originalAmountMinor,issuedAt:receivable.issuedAt.toISOString(),dueAt:receivable.dueAt.toISOString(),
        lines:command.lines,selectedEvidenceIds,openLoopId:receivable.openLoop.id,
        openLoopVersion:receivable.openLoop.stateVersion,decisionHash:receivable.openLoop.decisionHash,
      };
    } else {
      const observation = await tx.constructionAccountingObservation.findFirst({where:{
        id:command.observationId,workspaceId:command.workspaceId,accountId:command.accountId,
        receivableId:receivable.id,kind:"PAYMENT",canonicalEffectApplied:false,
        matchStatus:{in:["EXACT","PARTIAL"]},
      }});
      if (!observation) throw new AccountingConflict("ACCOUNTING_PAYMENT_NOT_EXACTLY_MATCHED");
      if (observation.currency !== receivable.currency || observation.amountMinor > receivable.outstandingAmountMinor) {
        throw new AccountingConflict("ACCOUNTING_PAYMENT_STALE_OR_CONFLICTING");
      }
      kind = "RECONCILIATION";
      observationId = observation.id;
      payload = {
        provider:account.provider,projectId:receivable.projectId,contactId:receivable.contactId,
        receivableId:receivable.id,observationId:observation.id,invoiceReference:receivable.invoiceReference,
        currency:receivable.currency,paymentAmountMinor:observation.amountMinor,
        outstandingBeforeMinor:receivable.outstandingAmountMinor,
        outstandingAfterMinor:receivable.outstandingAmountMinor-observation.amountMinor,
        suppliedAt:observation.suppliedAt.toISOString(),observationContentHash:observation.contentHash,
      };
    }
    const payloadHash = accountingDraftPayloadHash({workspaceId:command.workspaceId,accountId:account.id,kind,
      receivableId:receivable.id,observationId,expectedReceivableVersion:receivable.version,payload,version:1});
    const row = await tx.constructionAccountingDraft.create({data:{
      workspaceId:command.workspaceId,accountId:account.id,commandId:command.commandId,commandHash,
      kind,provider:account.provider,projectId:receivable.projectId,contactId:receivable.contactId,
      receivableId:receivable.id,observationId,expectedReceivableVersion:receivable.version,
      selectedEvidenceIds,payload:asJson(payload),version:1,payloadHash,status:"PREPARED_UNPOSTED",
      canonicalEffectApplied:false,externalEffectCount:0,externalWritePerformed:false,
    }});
    const result = draftResult(row,command.commandId,false);
    await saveDecision(tx,{workspaceId:command.workspaceId,commandId:command.commandId,commandHash,
      entityType:"DRAFT",entityId:row.id,action:command.action,stateBefore:null,stateAfter:row.status,
      result,actorId:input.userId});
    return result;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5_000,timeout:15_000}));
}

export async function approveAccountingDraft(input: {userId:string;command:unknown}) {
  const command:ApproveAccountingDraftCommand = approveAccountingDraftCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return withAccountingRefusal({workspaceId:command.workspaceId,operationId:command.commandId,
    operationKind:command.action,inputHash:commandHash,actorId:input.userId},()=>prisma.$transaction(async (tx) => {
    await lock(tx,`${command.workspaceId}:command:${command.commandId}`);
    await requireOffice(tx,input.userId,command.workspaceId);
    const replay = await existingDecision(tx,command.workspaceId,command.commandId,commandHash);
    if (replay) return accountingDraftResultSchema.parse({...accountingDraftResultSchema.parse(replay),replayed:true});
    await lock(tx,`${command.workspaceId}:draft:${command.draftId}`);
    const draft = await tx.constructionAccountingDraft.findFirst({where:{id:command.draftId,workspaceId:command.workspaceId},include:{account:true}});
    if (!draft) throw new ConstructionAccessDenied();
    if (draft.status !== "PREPARED_UNPOSTED") throw new AccountingConflict("ACCOUNTING_DRAFT_ALREADY_DECIDED");
    if (draft.version !== command.expectedVersion || draft.payloadHash !== command.expectedPayloadHash) throw new AccountingConflict("ACCOUNTING_DRAFT_BINDING_CONFLICT");
    if (draft.account.status !== "PREPARED_DISABLED") throw new AccountingConflict("ACCOUNTING_ACCOUNT_NOT_ACTIVE");
    let canonicalEffectApplied = false;
    let canonicalEffectId:string|null = null;
    if (draft.kind === "RECONCILIATION") {
      await lock(tx,`${command.workspaceId}:receivable:${draft.receivableId}`);
      const receivable = await tx.constructionReceivable.findFirst({where:{id:draft.receivableId,workspaceId:command.workspaceId}});
      const observation = draft.observationId ? await tx.constructionAccountingObservation.findFirst({where:{
        id:draft.observationId,workspaceId:command.workspaceId,accountId:draft.accountId,
      }}) : null;
      if (!receivable || !observation) throw new ConstructionAccessDenied();
      if (receivable.version !== draft.expectedReceivableVersion) throw new AccountingConflict("RECEIVABLE_VERSION_CONFLICT");
      if (observation.canonicalEffectApplied || !["EXACT","PARTIAL"].includes(observation.matchStatus) ||
          observation.currency !== receivable.currency || observation.amountMinor > receivable.outstandingAmountMinor) {
        throw new AccountingConflict("ACCOUNTING_RECONCILIATION_STALE_OR_CONFLICTING");
      }
      const outstanding = receivable.outstandingAmountMinor-observation.amountMinor;
      const event = await tx.constructionReceivableEvent.create({data:{
        workspaceId:command.workspaceId,receivableId:receivable.id,kind:"payment_received",
        eventKey:`r27:reconciliation:${draft.id}`,amountMinor:observation.amountMinor,
        resultingOutstandingMinor:outstanding,note:`R27 approved ${draft.provider} payment reconciliation.`,
        sourceRef:`accounting-observation:${observation.id}:${observation.contentHash}`,
        actorId:input.userId,occurredAt:observation.suppliedAt,
      }});
      await tx.constructionReceivable.update({where:{id:receivable.id},data:{
        outstandingAmountMinor:outstanding,status:outstanding===0?"paid":"partial",version:{increment:1},
        paidAt:outstanding===0?observation.suppliedAt:null,
      }});
      await tx.constructionAccountingObservation.update({where:{id:observation.id},data:{canonicalEffectApplied:true}});
      canonicalEffectApplied = true;
      canonicalEffectId = event.id;
    }
    const approved = await tx.constructionAccountingDraft.update({where:{id:draft.id},data:{
      status:"APPROVED_UNPOSTED",version:{increment:1},approvedByUserId:input.userId,approvedAt:new Date(),
      canonicalEffectApplied,canonicalEffectId,externalEffectCount:0,externalWritePerformed:false,
    }});
    const result = draftResult(approved,command.commandId,false);
    await saveDecision(tx,{workspaceId:command.workspaceId,commandId:command.commandId,commandHash,
      entityType:"DRAFT",entityId:draft.id,action:command.action,stateBefore:draft.status,stateAfter:approved.status,
      result,actorId:input.userId});
    return result;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5_000,timeout:15_000}));
}

export async function accountingCockpitForUser(input: {userId:string;workspaceId:string}) {
  const membership = await requireActiveConstructionMember(prisma,input.userId,input.workspaceId);
  if (membership.role === "member") return accountingCockpitSchema.parse({
    schemaVersion:1,workspaceId:input.workspaceId,role:"field_worker",accounts:[],observations:[],drafts:[],receivables:[],
    counts:{accounts:0,observations:0,drafts:0,unresolved:0},financialDataVisible:false,providerObserved:false,externalWriteEnabled:false,
  });
  const [accounts,observations,drafts,receivables] = await Promise.all([
    prisma.constructionAccountingAccount.findMany({where:{workspaceId:input.workspaceId},orderBy:[{createdAt:"desc"},{id:"asc"}]}),
    prisma.constructionAccountingObservation.findMany({where:{workspaceId:input.workspaceId},orderBy:[{suppliedAt:"desc"},{id:"asc"}]}),
    prisma.constructionAccountingDraft.findMany({where:{workspaceId:input.workspaceId},orderBy:[{createdAt:"desc"},{id:"asc"}]}),
    prisma.constructionReceivable.findMany({where:{workspaceId:input.workspaceId},orderBy:[{dueAt:"asc"},{id:"asc"}]}),
  ]);
  return accountingCockpitSchema.parse({
    schemaVersion:1,workspaceId:input.workspaceId,role:membership.role === "owner"?"owner":"admin",
    accounts:accounts.map((row)=>({id:row.id,provider:row.provider,status:row.status,version:row.version,
      capabilities:row.capabilities,credentialStored:false,externalWriteEnabled:false})),
    observations:observations.map((row)=>({id:row.id,kind:row.kind,projectId:row.projectId,receivableId:row.receivableId,
      amountMinor:row.amountMinor,currency:row.currency,observedStatus:row.observedStatus,matchStatus:row.matchStatus,
      matchReason:row.matchReason,suppliedAt:row.suppliedAt.toISOString()})),
    drafts:drafts.map((row)=>({id:row.id,kind:row.kind,provider:row.provider,projectId:row.projectId,
      receivableId:row.receivableId,version:row.version,payload:jsonRecord(row.payload),payloadHash:row.payloadHash,
      status:row.status,canonicalEffectApplied:row.canonicalEffectApplied,createdAt:row.createdAt.toISOString()})),
    receivables:receivables.map((row)=>({id:row.id,projectId:row.projectId,invoiceReference:row.invoiceReference,
      originalAmountMinor:row.originalAmountMinor,outstandingAmountMinor:row.outstandingAmountMinor,
      currency:row.currency,status:row.status,version:row.version})),
    counts:{accounts:accounts.length,observations:observations.length,drafts:drafts.length,
      unresolved:observations.filter((row)=>!["EXACT","PARTIAL"].includes(row.matchStatus)).length},
    financialDataVisible:true,providerObserved:false,externalWriteEnabled:false,
  });
}
