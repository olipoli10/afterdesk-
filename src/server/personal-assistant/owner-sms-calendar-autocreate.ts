import "server-only";

import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { loadStoredPersonalIntentReviewProof } from "@/server/model-gateway/personal-intent/review-proof";
import { prepareStoredPersonalIntentReview } from "@/server/model-gateway/personal-intent/review-consumer";
import { resolvePersonalCalendarTemporal } from "@/server/model-gateway/personal-intent/temporal";
import { authorizeDeviceCalendarOperationInTransaction } from "./device-bridge";
import type { ConnectorEnvironment } from "./google-client";

export const OWNER_SMS_CALENDAR_AUTOCREATE_AUTHORITY = "ENDVERA-OWNER-SMS-CALENDAR-AUTOCREATE-20260913-V1";
const PILOT_EXPIRY = "2026-10-10T01:18:26Z";
const id = z.string().min(1).max(191);
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const draftSchema = z.object({
  title: z.string().trim().min(1).max(240),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  timezone: z.string().min(1).max(80),
}).strict();
const reviewSchema = z.object({
  status: z.literal("REVIEW_PREPARED_NOT_AUTHORIZED"),
  executionAuthorized: z.literal(false),
  externalTransportPerformed: z.literal(false),
  accounting: z.literal("UNSETTLED"),
  automaticRetry: z.literal(false),
  semanticIntentVerified: z.literal(false),
  source: z.object({ operationId: id, text: z.string().min(1).max(10_000), receivedAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(100) }).strict(),
  modelChildOperationId: id,
  actions: z.array(z.object({
    actionId: id,
    kind: z.literal("PREPARE_CALENDAR_EVENT"),
    status: z.literal("PREPARED_UNSENT"),
    operationId: id,
    requestHash: hex,
    draft: draftSchema,
  }).strict()).length(1),
}).strict();

type PolicyInput = Readonly<{
  sourceText: string;
  receivedAt: string;
  inspectedAt: string;
  startsAt: string;
  endsAt: string;
}>;

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/’/g, "'").toLowerCase().trim();

/** Closed create-only policy. This does not authenticate a sender or authorize
 * an effect; the transaction gate below separately reloads every durable proof. */
export function inspectOwnerSmsCalendarAutocreatePolicy(input: PolicyInput) {
  const normalized = normalize(input.sourceText);
  const semantic = normalized.replace(/\bs[' ]il te plait\b|\bsvp\b|\bstp\b/g, " ");
  if (/\b(?:pas|jamais|non|sauf|si|sinon|unless|except|never|not)\b|\bn[' ]/.test(semantic)) {
    return { eligible: false as const, reason: "CONDITIONAL_OR_NEGATED_REQUEST" as const };
  }
  if (/\b(?:annule|annuler|supprime|supprimer|modifie|modifier|deplace|deplacer|change|changer|remplace|remplacer)\b/.test(normalized)) {
    return { eligible: false as const, reason: "CREATE_ONLY_REQUIRED" as const };
  }
  if (/\b(?:texte|texto|sms|appelle|appeler|telephone|telephoner|envoie|envoyer)\b/.test(normalized)) {
    return { eligible: false as const, reason: "OTHER_EFFECT_REQUESTED" as const };
  }
  const create = /\b(?:ajoute|ajoutes|ajouter|rajoute|rajoutes|rajouter|cree|crees|creer|mets|mettre|inscris|inscrire)\b/.test(normalized);
  const calendar = /\b(?:calendrier|agenda)(?:\s+google)?\b/.test(normalized);
  if (!create || !calendar) return { eligible: false as const, reason: "EXPLICIT_CREATE_COMMAND_REQUIRED" as const };
  const received = Date.parse(input.receivedAt), inspected = Date.parse(input.inspectedAt);
  const start = Date.parse(input.startsAt), end = Date.parse(input.endsAt);
  if (![received, inspected, start, end].every(Number.isFinite)) return { eligible: false as const, reason: "VALID_TIME_REQUIRED" as const };
  if (start < received || start < inspected - 60_000) return { eligible: false as const, reason: "FUTURE_EVENT_REQUIRED" as const };
  const duration = end - start;
  if (duration < 60_000 || duration > 24 * 60 * 60_000) return { eligible: false as const, reason: "BOUNDED_DURATION_REQUIRED" as const };
  return { eligible: true as const };
}

export function ownerSmsCalendarAutocreateEnabled(env: ConnectorEnvironment, now = Date.now()) {
  return env.ENDVERA_OWNER_SMS_CALENDAR_AUTOCREATE_ENABLED === "true"
    && env.ENDVERA_OWNER_SMS_CALENDAR_AUTOCREATE_AUTHORITY_REF === OWNER_SMS_CALENDAR_AUTOCREATE_AUTHORITY
    && env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED === "true"
    && env.ENDVERA_EXTERNAL_AUTHORITY_REF === PERSONAL_MODEL_AUTHORITY
    && env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT === PILOT_EXPIRY
    && now < Date.parse(PILOT_EXPIRY);
}

type SourceContext = Readonly<{ claim: Readonly<{ operationId: string; workspaceId: string; userId: string; attempt: 1; leaseUntil: string }>; signal: AbortSignal; deadlineAt: number }>;
const appReview = (reason: string) => Object.freeze({ status: "APP_REVIEW_ONLY" as const, reason, executionAuthorized: false as const });

/** Converts one exact verified-owner SMS calendar draft into a one-shot Android
 * directive. The standing authority is a server policy, never model output. */
export async function authorizeOwnerSmsCalendarAutocreateInTransaction(
  tx: Prisma.TransactionClient,
  context: SourceContext,
  suppliedReview: unknown,
  env: ConnectorEnvironment = process.env,
) {
  if (!ownerSmsCalendarAutocreateEnabled(env)) return appReview("DISABLED");
  const review = reviewSchema.safeParse(suppliedReview);
  if (!review.success) return appReview("SINGLE_EXACT_DEVICE_CREATE_REQUIRED");
  const current = () => {
    if (!ownerSmsCalendarAutocreateEnabled(env) || context.signal.aborted || !Number.isFinite(context.deadlineAt) || Date.now() >= context.deadlineAt) {
      throw new Error("OWNER_SMS_CALENDAR_AUTOCREATE_REVOKED");
    }
  };
  current();
  const input = { enabled: true as const, userId: context.claim.userId, workspaceId: context.claim.workspaceId,
    sourceOperationId: context.claim.operationId, modelChildOperationId: review.data.modelChildOperationId };
  const proof = await loadStoredPersonalIntentReviewProof(tx, input, env as NodeJS.ProcessEnv);
  current();
  if (proof.status !== "REVIEW_PROOF_INSPECTED_NOT_AUTHORIZED" || proof.source.conversationContext !== null) return appReview("DIRECT_SOURCE_REQUIRED");
  const reloaded = await prepareStoredPersonalIntentReview(tx, input, env as NodeJS.ProcessEnv);
  current();
  if (canonicalJson(reloaded) !== canonicalJson(review.data)) throw new Error("OWNER_SMS_CALENDAR_AUTOCREATE_REVIEW_CHANGED");
  if (review.data.source.operationId !== context.claim.operationId || review.data.source.operationId !== proof.input.sourceOperationId
    || review.data.source.text !== proof.source.input.source || review.data.source.receivedAt !== proof.source.receivedAt
    || review.data.source.timezone !== proof.source.timezone) throw new Error("OWNER_SMS_CALENDAR_AUTOCREATE_SOURCE_CHANGED");
  const proposed = proof.inspected.proposal.actions;
  if (proposed.length !== 1 || proposed[0].kind !== "PREPARE_CALENDAR_EVENT" || proposed[0].dependsOn.length !== 0) {
    return appReview("SINGLE_EXACT_DEVICE_CREATE_REQUIRED");
  }
  const action = proposed[0], reviewed = review.data.actions[0];
  if (action.id !== reviewed.actionId || action.title.quote !== reviewed.draft.title) throw new Error("OWNER_SMS_CALENDAR_AUTOCREATE_DRAFT_CHANGED");
  const temporal = resolvePersonalCalendarTemporal(proof.source.input, proof.proposalRaw, action.id,
    { receivedAt: proof.source.receivedAt, timezone: proof.source.timezone });
  if (temporal.status !== "RESOLVED_NOT_AUTHORIZED") return appReview("EXACT_TIME_REQUIRED");
  if (temporal.title !== reviewed.draft.title || temporal.startsAtUtc !== reviewed.draft.startsAt
    || temporal.endsAtUtc !== reviewed.draft.endsAt || temporal.timezone !== reviewed.draft.timezone) {
    throw new Error("OWNER_SMS_CALENDAR_AUTOCREATE_TEMPORAL_CHANGED");
  }
  const clock = await tx.$queryRawUnsafe<Array<{ now: Date }>>(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS now`);
  current();
  if (clock.length !== 1 || !(clock[0].now instanceof Date) || !Number.isFinite(clock[0].now.getTime())) throw new Error("OWNER_SMS_CALENDAR_AUTOCREATE_CLOCK_REQUIRED");
  const policy = inspectOwnerSmsCalendarAutocreatePolicy({ sourceText: review.data.source.text, receivedAt: review.data.source.receivedAt,
    inspectedAt: clock[0].now.toISOString(), startsAt: reviewed.draft.startsAt, endsAt: reviewed.draft.endsAt });
  if (!policy.eligible) return appReview(policy.reason);
  const operation = await tx.personalAssistantOperation.findFirst({
    where: { id: reviewed.operationId, workspaceId: context.claim.workspaceId, createdByUserId: context.claim.userId,
      kind: "calendar_write", status: "pending", attempts: 0, leaseUntil: null, requestHash: reviewed.requestHash,
      correlatedTemporalReceiptId: null },
    include: { account: { include: { grants: true } } },
  });
  current();
  if (!operation || operation.account.provider !== "endvera_android_device") return appReview("ANDROID_DEVICE_CALENDAR_REQUIRED");
  const correlated = await tx.personalSmsCorrelatedCalendarReview.findUnique({ where: { calendarOperationId: operation.id }, select: { id: true } });
  if (correlated) return appReview("DIRECT_SOURCE_REQUIRED");
  const authorized = await authorizeDeviceCalendarOperationInTransaction(tx, {
    userId: context.claim.userId,
    workspaceId: context.claim.workspaceId,
    operationId: reviewed.operationId,
    expectedRequestHash: reviewed.requestHash,
    standingAuthority: {
      kind: "OWNER_VERIFIED_SMS_STANDING_V1",
      authorityRef: OWNER_SMS_CALENDAR_AUTOCREATE_AUTHORITY,
      sourceOperationId: context.claim.operationId,
      modelChildOperationId: review.data.modelChildOperationId,
      sourceAuthorityFingerprint: proof.source.authorityFingerprint,
    },
  });
  current();
  return Object.freeze({ status: "DEVICE_CALENDAR_AUTOCREATE_AUTHORIZED" as const, executionAuthorized: true as const,
    providerExecutionPerformed: false as const, automaticRetry: false as const, operationId: authorized.operationId,
    directiveId: authorized.directiveId, directiveRequestHash: authorized.requestHash, workspaceId: context.claim.workspaceId,
    userId: context.claim.userId, draft: reviewed.draft });
}
