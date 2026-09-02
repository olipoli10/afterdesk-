import "server-only";

import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  approveEmailDraftCommandSchema,
  emailAccountCommandSchema,
  emailCockpitSchema,
  emailInboundResultSchema,
  normalizedEmailInboundEventSchema,
  preparedEmailDraftResultSchema,
  prepareEmailDraftCommandSchema,
  trustedEmailAdapterAssertionSchema,
  type EmailInboundResult,
} from "@/lib/construction-operating-assistant-r26/contracts";
import {
  emailDraftPayloadHash,
  emailEventHash,
} from "@/lib/construction-operating-assistant-r26/policy";
import { processUnifiedIntent } from "@/server/construction-operating-assistant-r18/unified-intent";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

const inboundInFlight = new Map<string, Promise<EmailInboundResult>>();

function asJson(value:unknown):Prisma.InputJsonValue{return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;}
async function requireManager(tx:Prisma.TransactionClient,userId:string,workspaceId:string){const m=await requireActiveConstructionMember(tx,userId,workspaceId);if(m.role!=="owner"&&m.role!=="admin")throw new ConstructionAccessDenied();return m;}
async function recordDecision(tx:Prisma.TransactionClient,input:{workspaceId:string;commandId:string;commandHash:string;entityType:string;entityId:string;action:string;stateBefore:string|null;stateAfter:string;result:unknown;actorId:string}){return tx.constructionEmailDecision.create({data:{...input,result:asJson(input.result)}});}

export async function manageEmailAccountR26(input:{userId:string;command:unknown}){
  const command=emailAccountCommandSchema.parse(input.command);const commandHash=sha256Canonical(command);
  return prisma.$transaction(async tx=>{
    await requireManager(tx,input.userId,command.workspaceId);
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r26:account:${command.workspaceId}:${command.commandId}`},0))::text AS acquired`);
    const replay=await tx.constructionEmailDecision.findUnique({where:{workspaceId_commandId:{workspaceId:command.workspaceId,commandId:command.commandId}}});
    if(replay){if(replay.commandHash!==commandHash)throw new Error("EMAIL_COMMAND_IDEMPOTENCY_CONFLICT");return {...(replay.result as Record<string,unknown>),replayed:true};}
    if(command.action==="PREPARE_EMAIL_ACCOUNT"){
      const existing=await tx.constructionEmailAccount.findUnique({where:{workspaceId_provider_accountRef:{workspaceId:command.workspaceId,provider:command.provider,accountRef:command.accountRef}}});
      const account=existing?await tx.constructionEmailAccount.update({where:{id:existing.id},data:{mailboxScopeRef:command.mailboxScopeRef,capabilities:command.capabilities,status:"PREPARED_DISABLED",version:{increment:1},cursorRef:null,cursorVersion:0,revokedAt:null}}):await tx.constructionEmailAccount.create({data:{workspaceId:command.workspaceId,provider:command.provider,accountRef:command.accountRef,mailboxScopeRef:command.mailboxScopeRef,capabilities:command.capabilities,preparedByUserId:input.userId}});
      const result={schemaVersion:1,commandId:command.commandId,accountId:account.id,workspaceId:command.workspaceId,provider:command.provider,status:"PREPARED_DISABLED",version:account.version,capabilities:account.capabilities,credentialStored:false,externalTransportEnabled:false,missingConfiguration:["OAUTH_AUTHORIZATION","PROVIDER_ADAPTER","PROVIDER_SYNC"],replayed:false,externalTransportPerformed:false};
      await recordDecision(tx,{workspaceId:command.workspaceId,commandId:command.commandId,commandHash,entityType:"email_account",entityId:account.id,action:command.action,stateBefore:existing?.status??null,stateAfter:account.status,result,actorId:input.userId});return result;
    }
    const account=await tx.constructionEmailAccount.findFirst({where:{id:command.accountId,workspaceId:command.workspaceId}});if(!account||account.version!==command.expectedVersion)throw new Error("EMAIL_ACCOUNT_VERSION_CONFLICT");
    const updated=await tx.constructionEmailAccount.update({where:{id:account.id},data:{status:"REVOKED",version:{increment:1},revokedAt:new Date()}});
    const result={schemaVersion:1,commandId:command.commandId,accountId:account.id,workspaceId:command.workspaceId,status:"REVOKED",version:updated.version,localAccessDisabled:true,replayed:false,externalTransportPerformed:false};
    await recordDecision(tx,{workspaceId:command.workspaceId,commandId:command.commandId,commandHash,entityType:"email_account",entityId:account.id,action:command.action,stateBefore:account.status,stateAfter:updated.status,result,actorId:input.userId});return result;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

async function replayInbound(workspaceId:string,eventId:string,providerMessageRef:string,eventHash:string){
  const row=await prisma.constructionEmailEvent.findFirst({where:{workspaceId,OR:[{eventId},{providerMessageRef}]}});if(!row)return null;
  if(row.eventId!==eventId||row.providerMessageRef!==providerMessageRef||row.eventHash!==eventHash)throw new Error("EMAIL_EVENT_IDEMPOTENCY_CONFLICT");
  return row.result?emailInboundResultSchema.parse({...row.result as object,replayed:true}):null;
}

async function applyInbound(input:{event:unknown;assertion:unknown}):Promise<EmailInboundResult>{
  const assertion=trustedEmailAdapterAssertionSchema.parse(input.assertion);if(!assertion.authenticityVerified)throw new Error("EMAIL_ADAPTER_AUTHENTICITY_UNVERIFIED");
  const event=normalizedEmailInboundEventSchema.parse(input.event);const hash=emailEventHash(event);
  const replay=await replayInbound(event.workspaceId,event.eventId,event.providerMessageRef,hash);if(replay)return replay;
  const claimed=await prisma.$transaction(async tx=>{
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r26:email:${event.workspaceId}:${event.providerMessageRef}`},0))::text AS acquired`);
    const existing=await tx.constructionEmailEvent.findFirst({where:{workspaceId:event.workspaceId,OR:[{eventId:event.eventId},{providerMessageRef:event.providerMessageRef}]}});if(existing){if(existing.eventId!==event.eventId||existing.providerMessageRef!==event.providerMessageRef||existing.eventHash!==hash)throw new Error("EMAIL_EVENT_IDEMPOTENCY_CONFLICT");const [account,evidenceCount]=await Promise.all([tx.constructionEmailAccount.findUniqueOrThrow({where:{id:existing.accountId},select:{preparedByUserId:true}}),tx.constructionEmailEvidenceLink.count({where:{emailEventId:existing.id}})]);return {...existing,preparedByUserId:account.preparedByUserId,evidenceCount,syncResult:null};}
    const account=await tx.constructionEmailAccount.findFirst({where:{id:event.accountId,workspaceId:event.workspaceId,status:"PREPARED_DISABLED"}});if(!account||!account.capabilities.includes("READ_SELECTED_CONTENT"))throw new Error("EMAIL_ACCOUNT_NOT_ACTIVE");
    const identity=await tx.constructionCommunicationIdentity.findUnique({where:{workspaceId_channel_normalizedAddress:{workspaceId:event.workspaceId,channel:"email",normalizedAddress:event.senderIdentityRef}},select:{contactId:true,verified:true,status:true}});
    if(!identity?.verified||identity.status!=="active")throw new Error("EMAIL_SENDER_NOT_AUTHORIZED");
    if(event.contactId&&identity.contactId!==event.contactId)throw new Error("EMAIL_CONTACT_CONFLICT");
    const contactId=event.contactId??identity.contactId;
    const contact=contactId?await tx.constructionContact.findFirst({where:{id:contactId,workspaceId:event.workspaceId,status:"active"},select:{id:true,projectId:true}}):null;
    const projectId=event.projectId??contact?.projectId??null;
    if(projectId){const p=await tx.constructionProject.findFirst({where:{id:projectId,workspaceId:event.workspaceId,status:"active"},select:{id:true}});if(!p)throw new Error("EMAIL_PROJECT_NOT_FOUND");}
    if(contact?.projectId&&projectId&&contact.projectId!==projectId)throw new Error("EMAIL_PROJECT_CONTACT_CONFLICT");
    const cursorRequiresSync=event.cursorContinuity==="SYNC_REQUIRED"||(account.cursorVersion===0?event.previousCursorRef!==null:event.previousCursorRef!==account.cursorRef);
    if(cursorRequiresSync){
      const message=await tx.constructionMessage.create({data:{workspaceId:event.workspaceId,projectId:null,contactId,direction:"inbound",channel:"email",provider:`endvera_email_${account.provider.toLowerCase()}`,providerMessageId:event.providerMessageRef,idempotencyKey:`r26:${event.eventId}`,sender:event.senderIdentityRef,recipients:event.recipientRefs,originalBody:event.normalizedBody,normalizedBody:event.normalizedBody,status:"refused",receivedAt:new Date(event.occurredAt)}});
      const row=await tx.constructionEmailEvent.create({data:{workspaceId:event.workspaceId,accountId:account.id,projectId:null,contactId,messageId:message.id,eventId:event.eventId,providerMessageRef:event.providerMessageRef,threadRef:event.threadRef,cursorRef:event.cursorRef,senderIdentityRef:event.senderIdentityRef,recipientRefs:event.recipientRefs,subject:event.subject,normalizedBody:event.normalizedBody,eventHash:hash,status:"SYNC_REQUIRED",verificationState:event.verificationState,occurredAt:new Date(event.occurredAt)}});
      const syncResult=emailInboundResultSchema.parse({schemaVersion:1,eventId:event.eventId,emailEventId:row.id,messageId:message.id,projectId:null,contactId,status:"REFUSED",reply:"La continuité du courriel doit être resynchronisée avant d'appliquer ce message à un chantier.",canonicalEffectId:null,evidenceLinkCount:0,cursorStatus:"SYNC_REQUIRED",replayed:false,externalTransportPerformed:false});
      await Promise.all([tx.constructionEmailEvent.update({where:{id:row.id},data:{result:asJson(syncResult)}}),tx.constructionEmailAccount.update({where:{id:account.id},data:{status:"SYNC_REQUIRED",version:{increment:1}}})]);
      return {...row,preparedByUserId:account.preparedByUserId,evidenceCount:0,syncResult};
    }
    const evidence=event.selectedEvidenceIds.length?await tx.constructionOpenLoopEvidence.findMany({where:{id:{in:event.selectedEvidenceIds},workspaceId:event.workspaceId,projectId:projectId??"",state:{not:"revoked"}},select:{id:true,contentHash:true}}):[];
    if(evidence.length!==event.selectedEvidenceIds.length||evidence.some(e=>!e.contentHash))throw new Error("EMAIL_EVIDENCE_NOT_ADMITTED");
    const message=await tx.constructionMessage.create({data:{workspaceId:event.workspaceId,projectId,contactId,direction:"inbound",channel:"email",provider:`endvera_email_${account.provider.toLowerCase()}`,providerMessageId:event.providerMessageRef,idempotencyKey:`r26:${event.eventId}`,sender:event.senderIdentityRef,recipients:event.recipientRefs,originalBody:event.normalizedBody,normalizedBody:event.normalizedBody,status:"received",receivedAt:new Date(event.occurredAt)}});
    const row=await tx.constructionEmailEvent.create({data:{workspaceId:event.workspaceId,accountId:account.id,projectId,contactId,messageId:message.id,eventId:event.eventId,providerMessageRef:event.providerMessageRef,threadRef:event.threadRef,cursorRef:event.cursorRef,senderIdentityRef:event.senderIdentityRef,recipientRefs:event.recipientRefs,subject:event.subject,normalizedBody:event.normalizedBody,eventHash:hash,status:projectId?"RECEIVED":"CLARIFICATION_REQUIRED",verificationState:event.verificationState,occurredAt:new Date(event.occurredAt),evidenceLinks:{create:evidence.map(e=>({workspaceId:event.workspaceId,projectId:projectId!,evidenceId:e.id,contentHash:e.contentHash!}))}}});
    await tx.constructionEmailAccount.update({where:{id:account.id},data:{cursorRef:event.cursorRef,cursorVersion:{increment:1}}});return {...row,preparedByUserId:account.preparedByUserId,evidenceCount:evidence.length,syncResult:null};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  if(claimed.syncResult)return claimed.syncResult;
  const persisted=await replayInbound(event.workspaceId,event.eventId,event.providerMessageRef,hash);if(persisted)return persisted;
  const intent=await processUnifiedIntent({userId:claimed.preparedByUserId,envelope:{schemaVersion:1,envelopeId:event.eventId,workspaceId:event.workspaceId,occurredAt:event.occurredAt,mode:"RESOLVE_ONLY",context:{projectId:claimed.projectId,contactId:claimed.contactId},source:{kind:"EMAIL_MESSAGE",sourceId:event.eventId,text:`${event.subject}\n${event.normalizedBody}`,verificationState:event.verificationState}}});
  const status=claimed.projectId?(intent.status==="CLARIFICATION_REQUIRED"?"CLARIFICATION_REQUIRED":"RESOLVED"):"CLARIFICATION_REQUIRED";
  const result=emailInboundResultSchema.parse({schemaVersion:1,eventId:event.eventId,emailEventId:claimed.id,messageId:claimed.messageId,projectId:claimed.projectId,contactId:claimed.contactId,status,reply:claimed.projectId?intent.reply:"À quel chantier appartient ce courriel?",canonicalEffectId:null,evidenceLinkCount:claimed.evidenceCount,cursorStatus:"CURRENT",replayed:false,externalTransportPerformed:false});
  await prisma.constructionEmailEvent.update({where:{id:claimed.id},data:{status,result:asJson(result)}});return result;
}

export async function processEmailInboundR26(input:{event:unknown;assertion:unknown}){const parsed=normalizedEmailInboundEventSchema.parse(input.event);const key=`${parsed.workspaceId}:${parsed.providerMessageRef}`;const active=inboundInFlight.get(key);if(active)return emailInboundResultSchema.parse({...await active,replayed:true});const run=applyInbound(input);inboundInFlight.set(key,run);try{return await run;}finally{inboundInFlight.delete(key);}}

async function validateEvidence(tx:Prisma.TransactionClient,workspaceId:string,projectId:string,ids:string[]){if(!ids.length)return;const rows=await tx.constructionOpenLoopEvidence.findMany({where:{id:{in:ids},workspaceId,projectId,state:{not:"revoked"}},select:{id:true,contentHash:true}});if(rows.length!==ids.length||rows.some(r=>!r.contentHash))throw new Error("EMAIL_EVIDENCE_NOT_ADMITTED");}

export async function prepareEmailDraftR26(input:{userId:string;command:unknown}){
  const c=prepareEmailDraftCommandSchema.parse(input.command);const commandHash=sha256Canonical(c);
  return prisma.$transaction(async tx=>{await requireManager(tx,input.userId,c.workspaceId);await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r26:draft:${c.workspaceId}:${c.commandId}`},0))::text AS acquired`);
    const existing=await tx.constructionEmailDraft.findUnique({where:{workspaceId_commandId:{workspaceId:c.workspaceId,commandId:c.commandId}}});if(existing){if(existing.commandHash!==commandHash)throw new Error("EMAIL_COMMAND_IDEMPOTENCY_CONFLICT");return preparedEmailDraftResultSchema.parse({...existing,commandId:c.commandId,draftId:existing.id,replayed:true});}
    const [account,project,contact,identity]=await Promise.all([tx.constructionEmailAccount.findFirst({where:{id:c.accountId,workspaceId:c.workspaceId,status:"PREPARED_DISABLED"}}),tx.constructionProject.findFirst({where:{id:c.projectId,workspaceId:c.workspaceId,status:"active"}}),tx.constructionContact.findFirst({where:{id:c.contactId,workspaceId:c.workspaceId,status:"active"}}),tx.constructionCommunicationIdentity.findUnique({where:{workspaceId_channel_normalizedAddress:{workspaceId:c.workspaceId,channel:"email",normalizedAddress:c.toRef}}})]);
    if(!account?.capabilities.includes("PREPARE_DRAFT")||!project||!contact||contact.projectId!==project.id||identity?.contactId!==contact.id||!identity.verified)throw new Error("EMAIL_DRAFT_CONTEXT_REFUSED");await validateEvidence(tx,c.workspaceId,c.projectId,c.selectedEvidenceIds);
    const payloadHash=emailDraftPayloadHash({...c,version:1});const draft=await tx.constructionEmailDraft.create({data:{workspaceId:c.workspaceId,accountId:c.accountId,projectId:c.projectId,contactId:c.contactId,commandId:c.commandId,commandHash,toRef:c.toRef,ccRefs:c.ccRefs,subject:c.subject,body:c.body,threadRef:c.threadRef,selectedEvidenceIds:c.selectedEvidenceIds,payloadHash}});
    const result=preparedEmailDraftResultSchema.parse({schemaVersion:1,commandId:c.commandId,draftId:draft.id,workspaceId:c.workspaceId,projectId:c.projectId,contactId:c.contactId,toRef:c.toRef,ccRefs:c.ccRefs,subject:c.subject,body:c.body,threadRef:c.threadRef,selectedEvidenceIds:c.selectedEvidenceIds,version:1,payloadHash,status:"PREPARED_UNSENT",replayed:false,externalTransportPerformed:false});await recordDecision(tx,{workspaceId:c.workspaceId,commandId:c.commandId,commandHash,entityType:"email_draft",entityId:draft.id,action:c.action,stateBefore:null,stateAfter:draft.status,result,actorId:input.userId});return result;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

export async function approveEmailDraftR26(input:{userId:string;command:unknown}){const c=approveEmailDraftCommandSchema.parse(input.command);const hash=sha256Canonical(c);return prisma.$transaction(async tx=>{await requireManager(tx,input.userId,c.workspaceId);await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r26:approve:${c.workspaceId}:${c.draftId}`},0))::text AS acquired`);const replay=await tx.constructionEmailDecision.findUnique({where:{workspaceId_commandId:{workspaceId:c.workspaceId,commandId:c.commandId}}});if(replay){if(replay.commandHash!==hash)throw new Error("EMAIL_COMMAND_IDEMPOTENCY_CONFLICT");return {...replay.result as object,replayed:true};}const draft=await tx.constructionEmailDraft.findFirst({where:{id:c.draftId,workspaceId:c.workspaceId}});if(!draft||draft.version!==c.expectedVersion||draft.payloadHash!==c.expectedPayloadHash)throw new Error("EMAIL_DRAFT_APPROVAL_MISMATCH");if(draft.status!=="PREPARED_UNSENT")throw new Error("EMAIL_DRAFT_ALREADY_APPROVED");const updated=await tx.constructionEmailDraft.update({where:{id:draft.id},data:{status:"APPROVED_UNSENT",approvedByUserId:input.userId,approvedAt:new Date()}});const result=preparedEmailDraftResultSchema.parse({schemaVersion:1,commandId:c.commandId,draftId:draft.id,workspaceId:draft.workspaceId,projectId:draft.projectId,contactId:draft.contactId,toRef:draft.toRef,ccRefs:draft.ccRefs,subject:draft.subject,body:draft.body,threadRef:draft.threadRef,selectedEvidenceIds:draft.selectedEvidenceIds,version:draft.version,payloadHash:draft.payloadHash,status:updated.status,replayed:false,externalTransportPerformed:false});await recordDecision(tx,{workspaceId:c.workspaceId,commandId:c.commandId,commandHash:hash,entityType:"email_draft",entityId:draft.id,action:c.action,stateBefore:draft.status,stateAfter:updated.status,result,actorId:input.userId});return result;},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}

export async function emailInboxCockpitForUserR26(input:{userId:string;workspaceId:string}){
  return prisma.$transaction(async tx=>{
    const membership=await requireActiveConstructionMember(tx,input.userId,input.workspaceId);
    const role=membership.role==="owner"?"owner":membership.role==="admin"?"admin":"field_worker";
    const counts={
      accounts:await tx.constructionEmailAccount.count({where:{workspaceId:input.workspaceId}}),
      events:await tx.constructionEmailEvent.count({where:{workspaceId:input.workspaceId}}),
      preparedUnsent:await tx.constructionEmailDraft.count({where:{workspaceId:input.workspaceId,status:{in:["PREPARED_UNSENT","APPROVED_UNSENT"]}}}),
    };
    if(role==="field_worker")return emailCockpitSchema.parse({schemaVersion:1,workspaceId:input.workspaceId,role,accounts:[],contacts:[],events:[],drafts:[],counts,providerObserved:false,externalTransportEnabled:false});
    const [accounts,contacts,events,drafts]=await Promise.all([
      tx.constructionEmailAccount.findMany({where:{workspaceId:input.workspaceId},orderBy:{createdAt:"desc"}}),
      tx.constructionCommunicationIdentity.findMany({where:{workspaceId:input.workspaceId,channel:"email",verified:true,status:"active",contactId:{not:null}},select:{contactId:true,normalizedAddress:true,contact:{select:{projectId:true,displayName:true}}},orderBy:{createdAt:"asc"}}),
      tx.constructionEmailEvent.findMany({where:{workspaceId:input.workspaceId},include:{_count:{select:{evidenceLinks:true}}},orderBy:{occurredAt:"desc"},take:100}),
      tx.constructionEmailDraft.findMany({where:{workspaceId:input.workspaceId},orderBy:{createdAt:"desc"},take:100}),
    ]);
    return emailCockpitSchema.parse({schemaVersion:1,workspaceId:input.workspaceId,role,accounts:accounts.map(a=>({id:a.id,provider:a.provider,status:a.status,version:a.version,capabilities:a.capabilities,credentialStored:false,externalTransportEnabled:false})),contacts:contacts.map(c=>({id:c.contactId!,projectId:c.contact?.projectId??null,displayName:c.contact?.displayName??"Contact",emailRef:c.normalizedAddress})),events:events.map(e=>({id:e.id,projectId:e.projectId,contactId:e.contactId,subject:e.subject,body:e.normalizedBody,status:e.status,evidenceLinkCount:e._count.evidenceLinks,occurredAt:e.occurredAt.toISOString()})),drafts:drafts.map(d=>({id:d.id,projectId:d.projectId,contactId:d.contactId,toRef:d.toRef,subject:d.subject,body:d.body,version:d.version,payloadHash:d.payloadHash,status:d.status,createdAt:d.createdAt.toISOString()})),counts,providerObserved:false,externalTransportEnabled:false});
  });
}
