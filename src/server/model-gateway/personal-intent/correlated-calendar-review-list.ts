import "server-only";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PERSONAL_MODEL_AUTHORITY } from "./budget-policy";
import { loadCorrelatedPersonalCalendarReviewInTransaction } from "./correlated-calendar-projection";
import { temporalActorSchema, temporalRegistryClock, temporalRegistryTransaction, temporalRequireLive,
  type TemporalRegistryContext, type TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import type { ConnectorEnvironment } from "@/server/personal-assistant/google-client";

const id = z.string().min(1).max(191).refine(value => value.trim() === value);
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const utc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value => {
  const date = new Date(value); return Number.isFinite(date.getTime()) && date.toISOString() === value;
});
// Presentation shape only, matching the frozen item DTO. No model/receipt proof
// algorithm is repeated here; every item still comes from the real locked reader.
const source = z.object({ operationId: id, requestHash: hex, text: z.string().min(1).max(10_000), receivedAt: utc }).strict();
const citation = z.object({ sourceOperationId: id, requestHash: hex, start: z.number().int().min(0).max(10_000),
  end: z.number().int().min(1).max(10_000), quote: z.string().min(1).max(10_000) }).strict();
const evidence = z.object({ version: z.literal("personal-correlated-calendar-local-preview-v1"), approvalAvailable: z.literal(false), provenance: z.literal("UNKNOWN"),
  sources: z.tuple([source.extend({ role: z.literal("ORIGINAL_REQUEST") }).strict(), source.extend({ role: z.literal("CLARIFICATION_REPLY") }).strict()]),
  citations: z.object({ title: citation, originalStart: citation, originalEnd: citation, answer: citation }).strict(), anchorReceivedAt: utc,
  clarifiedSlot: z.enum(["START", "END"]), draft: z.object({ title: z.string().min(1).max(240).refine(value => value.trim() === value),
    startsAt: utc, endsAt: utc, timezone: z.string().min(1).max(80) }).strict() }).strict();
const review = z.object({ version: z.literal("personal-correlated-calendar-review-v1"), reviewId: id, inspectedAt: utc, preparedAt: utc, preparationExpiresAt: utc,
  currentStatus: z.enum(["pending", "processing", "completed", "uncertain", "refused"]), readOnly: z.literal(true), approvalAvailable: z.literal(false),
  executionAuthorized: z.literal(false), semanticInterpretationVerified: z.literal(false), evidence }).strict().refine(value =>
  value.evidence.sources[1].receivedAt <= value.preparedAt && value.preparedAt <= value.inspectedAt && value.inspectedAt < value.preparationExpiresAt);
export const correlatedCalendarReviewListResponseSchema = z.object({ version: z.literal("personal-correlated-calendar-review-list-v1"), workspaceId: id,
  readOnly: z.literal(true), approvalAvailable: z.literal(false), executionAuthorized: z.literal(false), reviews: z.array(review).max(5), hasMore: z.boolean(),
}).strict().refine(value => new Set(value.reviews.map(item => item.reviewId)).size === value.reviews.length);
// Stable alias retained for the concurrently integrated pure-schema caller.
export const correlatedCalendarReviewListSchema = correlatedCalendarReviewListResponseSchema;
export type CorrelatedCalendarReviewListResponse = z.infer<typeof correlatedCalendarReviewListSchema>;
const inputSchema = z.object({ enabled: z.literal(true), actor: temporalActorSchema }).strict();
export type CorrelatedCalendarReviewListInput = Omit<z.infer<typeof inputSchema>, "enabled"> & { enabled?: boolean };
const dateEpoch = z.date().transform(value => value.getTime());
const ownerSchema = z.object({ workspaceId: id, ownerUserId: id, workspaceUpdatedAt: dateEpoch, memberId: id, memberUserId: id,
  memberRole: z.literal("owner"), memberUpdatedAt: dateEpoch }).strict();
const ownerSql = `SELECT w.id AS "workspaceId",w."ownerUserId",(w."updatedAt" AT TIME ZONE 'UTC') AS "workspaceUpdatedAt",
  m.id AS "memberId",m."userId" AS "memberUserId",m.role AS "memberRole",(m."updatedAt" AT TIME ZONE 'UTC') AS "memberUpdatedAt"
  FROM "ConstructionWorkspace" w JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id
  WHERE w.id=$1 AND w."ownerUserId"=$2 AND w.status='active' AND m."userId"=$2 AND m.status='active' AND m.role='owner'`;
const on = (env: ConnectorEnvironment) => env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED === "true";
const disabled = () => Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
function unavailable(): never { throw new Error("CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE"); }
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

/** Pure transport-shape check only; does not authenticate the supplied evidence. */
export function parseCorrelatedCalendarReviewListResponse(raw: unknown) {
  try { return freeze(correlatedCalendarReviewListSchema.parse(raw)); } catch { return unavailable(); }
}
function monotonicElapsed(start: number) {
  const elapsed = performance.now() - start;
  if (!Number.isFinite(elapsed) || elapsed < 0) unavailable();
  return elapsed;
}
async function owner(tx: TemporalRegistryDB, actor: z.infer<typeof temporalActorSchema>, lock: boolean) {
  const rows = await tx.$queryRawUnsafe<unknown[]>(ownerSql + (lock ? " FOR SHARE OF w,m" : ""), actor.workspaceId, actor.userId);
  if (rows.length !== 1) unavailable();
  const result = ownerSchema.parse(rows[0]);
  if (result.workspaceId !== actor.workspaceId || result.ownerUserId !== actor.userId || result.memberUserId !== actor.userId) unavailable();
  return result;
}
function sameOwner(a: z.infer<typeof ownerSchema>, b: z.infer<typeof ownerSchema>) {
  return a.workspaceId === b.workspaceId && a.ownerUserId === b.ownerUserId && a.workspaceUpdatedAt === b.workspaceUpdatedAt
    && a.memberId === b.memberId && a.memberUserId === b.memberUserId && a.memberRole === b.memberRole && a.memberUpdatedAt === b.memberUpdatedAt;
}

/** Latest five, all-or-unavailable. One transaction retains every item's canonical
 * namespace/evidence locks; contention aborts rather than skipping a failed item.
 * No arbitrary review ids, cursor, nested transaction, preparation or retry. */
export async function readCorrelatedPersonalCalendarReviewList(raw: CorrelatedCalendarReviewListInput, env: ConnectorEnvironment = process.env,
  context: TemporalRegistryContext = { deadlineAt: Date.now() + 5000 }) {
  if (!on(env) || raw.enabled !== true) return disabled();
  try {
    const started = performance.now(), input = inputSchema.parse(raw);
    if (!Number.isFinite(context.deadlineAt)) unavailable();
    const c = Object.freeze({ deadlineAt: Math.min(context.deadlineAt, Date.now() + 5000), signal: context.signal });
    const live = () => {
      temporalRequireLive(c, env);
      if (!on(env) || monotonicElapsed(started) >= 5000 || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY
        || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z") unavailable();
    };
    live();
    const prepared = await prisma.$transaction(async tx => {
      await temporalRegistryTransaction(tx, c, env); live();
      // No owner row lock before the item reader's canonical namespace ordering.
      const initialOwner = await owner(tx, input.actor, false); live();
      const found = await tx.$queryRawUnsafe<unknown[]>(`SELECT id FROM "PersonalSmsCorrelatedCalendarReview"
        WHERE "workspaceId"=$1 AND "userId"=$2 ORDER BY "createdAt" DESC,id DESC LIMIT 6`, input.actor.workspaceId, input.actor.userId); live();
      const candidates = z.array(z.object({ id }).strict()).max(6).parse(found);
      if (new Set(candidates.map(row => row.id)).size !== candidates.length) unavailable();
      const reviews: CorrelatedCalendarReviewListResponse["reviews"] = [];
      for (const candidate of candidates.slice(0, 5)) {
        live();
        const item = await loadCorrelatedPersonalCalendarReviewInTransaction(tx, { enabled: true, actor: input.actor, reviewId: candidate.id }, env, c); live();
        if (item.status !== "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED" || item.committed !== false || item.review.reviewId !== candidate.id) unavailable();
        // Parse/copy now, not after the next awaited item or commit.
        reviews.push(review.parse(item.review));
      }
      const finalOwner = await owner(tx, input.actor, true); live();
      if (!sameOwner(initialOwner, finalOwner)) unavailable();
      // Sampling before the DB clock SELECT conservatively includes its round trip
      // in the post-commit age bound. Do not substitute host/device wall-clock time.
      const sampledAt = performance.now(), finalClock = await temporalRegistryClock(tx); live();
      const dbEpoch = finalClock.getTime(), pilot = Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT!);
      if (dbEpoch >= pilot || reviews.some(item => dbEpoch < Date.parse(item.inspectedAt) || dbEpoch >= Date.parse(item.preparationExpiresAt))) unavailable();
      const result = parseCorrelatedCalendarReviewListResponse({ version: "personal-correlated-calendar-review-list-v1", workspaceId: input.actor.workspaceId,
        readOnly: true, approvalAvailable: false, executionAuthorized: false, reviews, hasMore: candidates.length === 6 });
      return { result, dbEpoch, sampledAt, pilot };
    }, { isolationLevel: "Serializable", maxWait: 500, timeout: 5000 });
    live();
    const latestPossibleDbTime = prepared.dbEpoch + monotonicElapsed(prepared.sampledAt);
    if (latestPossibleDbTime >= prepared.pilot || prepared.result.reviews.some(item => latestPossibleDbTime >= Date.parse(item.preparationExpiresAt))) unavailable();
    return prepared.result;
  } catch { return unavailable(); }
}
