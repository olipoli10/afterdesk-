import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { normalizedEmailInboundEventSchema, type NormalizedEmailInboundEvent } from "./contracts";
export function opaqueEmailRef(input:unknown){return `email_${sha256Canonical({schemaVersion:1,scope:"email-r26",input})}`;}
export function emailEventHash(input:NormalizedEmailInboundEvent|unknown){return sha256Canonical({schemaVersion:1,scope:"email-event-r26",event:normalizedEmailInboundEventSchema.parse(input)});}
export function emailDraftPayloadHash(input:{workspaceId:string;accountId:string;projectId:string;contactId:string;toRef:string;ccRefs:string[];subject:string;body:string;threadRef:string|null;selectedEvidenceIds:string[];version:number}){return sha256Canonical({schemaVersion:1,scope:"email-draft-r26",...input,ccRefs:[...input.ccRefs].sort(),selectedEvidenceIds:[...input.selectedEvidenceIds].sort()});}
