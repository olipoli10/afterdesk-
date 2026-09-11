import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";

const id = z.string().min(1).max(191);
// Preserve the established preparation hash field order. PostgreSQL JSONB key
// order is not the original JS insertion order, so hashing its raw object would
// spuriously mark an unchanged draft as altered.
const calendarRequestSchema = z.object({ title: z.string(), startsAt: z.string(), endsAt: z.string(), timezone: z.string(),
  accountVersion: z.number().int(), requestId: z.string().uuid() }).strict();
const outboundRequestSchema = z.object({ to: z.string(), from: z.string(), text: z.string(), sourceOperationId: z.string().optional() }).strict();
const draftSchema = z.record(z.string().min(1).max(40), z.string().max(4000)).refine(value => Object.keys(value).length <= 5);
const actionSchema = z.object({ actionId: id, kind: z.enum(["READ_CALENDAR", "PREPARE_CALENDAR_EVENT", "PREPARE_SELF_SMS", "PREPARE_SELF_CALL", "CLARIFY"]),
  status: z.enum(["CLARIFY", "READ_REVIEW_ONLY", "PREPARED_UNSENT"]), question: z.string().max(1000).optional(),
  operationId: id.optional(), requestHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), draft: draftSchema.optional() }).strict();
const reviewSchema = z.object({ status: z.literal("REVIEW_PREPARED_NOT_AUTHORIZED"), executionAuthorized: z.literal(false),
  externalTransportPerformed: z.literal(false), accounting: z.literal("UNSETTLED"), automaticRetry: z.literal(false), semanticIntentVerified: z.literal(false),
  source: z.object({ operationId: id, text: z.string().min(1).max(10_000), receivedAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(100) }).strict(),
  modelChildOperationId: id, actions: z.array(actionSchema).min(1).max(10) }).strict();
type SourceRow = { id: string; request: unknown; requestHash: string; result: unknown; createdAt: Date; modelChildOperationId: string };
type DraftRow = { id: string; kind: string; status: string; request: unknown; requestHash: string; provider: string };
type Action = z.infer<typeof actionSchema>;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

function sourceMatches(row: SourceRow, review: z.infer<typeof reviewSchema>) {
  const request = object(row.request);
  if (!request || !(row.createdAt instanceof Date) || !Number.isFinite(row.createdAt.getTime())) return false;
  const { accountSid, messageSid, from, to, body } = request;
  if (![accountSid, messageSid, from, to, body].every(value => typeof value === "string")) return false;
  return review.source.operationId === row.id && review.modelChildOperationId === row.modelChildOperationId
    && review.source.text === body && Date.parse(review.source.receivedAt) === row.createdAt.getTime()
    && hash(JSON.stringify({ accountSid, messageSid, from, to, body })) === row.requestHash;
}

function currentAction(action: Action, current: Map<string, DraftRow>) {
  const base = { actionId: action.actionId, kind: action.kind, recordedStatus: action.status,
    ...(action.question ? { question: action.question } : {}), ...(action.draft ? { draft: action.draft } : {}) };
  if (action.status === "CLARIFY") return { ...base, currentStatus: "CLARIFY", nextDecision: "CLARIFY_REQUEST" };
  if (action.status === "READ_REVIEW_ONLY" && action.kind === "READ_CALENDAR") {
    return { ...base, currentStatus: "NOT_READ", nextDecision: "REVIEW_CALENDAR_READ" };
  }
  const row = action.operationId ? current.get(action.operationId) : undefined;
  const expectedKind = action.kind === "PREPARE_CALENDAR_EVENT" ? "calendar_write" : action.kind === "PREPARE_SELF_SMS" ? "sms_outbound"
    : action.kind === "PREPARE_SELF_CALL" ? "voice_outbound" : null;
  const request = object(row?.request);
  const parsed = expectedKind === "calendar_write" ? calendarRequestSchema.safeParse(row?.request) : outboundRequestSchema.safeParse(row?.request);
  const keys = expectedKind === "calendar_write" ? ["title", "startsAt", "endsAt", "timezone"] : ["to", "from", "text"];
  const exact = row && expectedKind && row.kind === expectedKind && row.requestHash === action.requestHash
    && parsed.success && hash(JSON.stringify(parsed.data)) === row.requestHash && request && action.draft
    && Object.keys(action.draft).length === keys.length && keys.every(key => typeof request[key] === "string" && request[key] === action.draft?.[key]);
  const allowed = ["pending", "approved", "processing", "completed", "uncertain", "refused"];
  if (!exact || !allowed.includes(row.status)) return { ...base, currentStatus: "UNAVAILABLE_OR_CHANGED", nextDecision: "MANUAL_REVIEW" };
  return { ...base, operationId: row.id, requestHash: row.requestHash, currentStatus: row.status,
    ...(row.kind === "calendar_write" ? { executionRoute: row.provider === "endvera_android_device" ? "ANDROID_DEVICE" : "GOOGLE_CALENDAR" } : {}),
    nextDecision: row.status === "pending" ? "REVIEW_EXACT_DRAFT" : row.status === "processing" || row.status === "approved" ? "WAIT_FOR_RESULT"
      : row.status === "completed" ? "CHECK_RECORDED_RESULT" : "MANUAL_REVIEW" };
}

/** Owner-only read projection. No action is prepared/approved/dispatched here.
 * Immutable recorded review and current draft state are distinct: a pending
 * snapshot must not present a subsequently consumed action as still unsent.
 */
export async function personalModelReviewsForOwner(userId: string, workspaceId: string) {
  id.parse(userId); id.parse(workspaceId);
  return prisma.$transaction(async tx => {
    const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT w.id FROM "ConstructionWorkspace" w JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id
      WHERE w.id=$1 AND w."ownerUserId"=$2 AND w.status='active' AND m."userId"=$2 AND m.status='active' AND m.role='owner'
      FOR SHARE OF w,m`, workspaceId, userId);
    if (owner.length !== 1) throw new Error("PERSONAL_MODEL_REVIEW_OWNER_REQUIRED");
    const rows = await tx.$queryRawUnsafe<SourceRow[]>(
      `SELECT s.id,s.request,s."requestHash",s.result,s."createdAt",c.id "modelChildOperationId"
      FROM "PersonalAssistantOperation" s JOIN "PersonalAssistantOperation" c ON c."sourcePersonalOperationId"=s.id
        AND c."workspaceId"=s."workspaceId" AND c."createdByUserId"=s."createdByUserId"
      WHERE s."workspaceId"=$1 AND s."createdByUserId"=$2 AND s.kind='personal_sms_inbound' AND s.status='completed'
        AND c.kind='personal_model_candidate_v1' AND c.status='completed' AND s.result ? 'personalModelReview'
      ORDER BY s."createdAt" DESC,s.id DESC LIMIT 20`, workspaceId, userId);
    const validated: Array<{ row: SourceRow; review: z.infer<typeof reviewSchema> }> = [];
    let unavailableCount = 0;
    for (const row of rows) {
      const raw = object(row.result)?.personalModelReview;
      if (Buffer.byteLength(JSON.stringify(raw) ?? "", "utf8") > 131_072) { unavailableCount++; continue; }
      const parsed = reviewSchema.safeParse(raw);
      if (!parsed.success || !sourceMatches(row, parsed.data) || new Set(parsed.data.actions.map(action => action.actionId)).size !== parsed.data.actions.length) {
        unavailableCount++; continue;
      }
      validated.push({ row, review: parsed.data });
    }
    const draftIds = [...new Set(validated.flatMap(({ review }) => review.actions.flatMap(action => action.operationId ? [action.operationId] : [])))];
    // Bounded by the already bounded source/action list. Do not use the scoped reverse
    // relation: even a malformed foreign relation must prevent a generic fallback.
    const related = draftIds.length ? await tx.personalSmsCorrelatedCalendarReview.findMany({ where: { calendarOperationId: { in: draftIds } },
      select: { calendarOperationId: true } }) : [];
    const excluded = new Set(related.map(row => row.calendarOperationId));
    const genericIds = draftIds.filter(id => !excluded.has(id));
    const drafts = genericIds.length ? await tx.personalAssistantOperation.findMany({ where: { id: { in: genericIds }, workspaceId, createdByUserId: userId,
      OR: [{ kind: "calendar_write", correlatedTemporalReceiptId: null },
        { kind: { in: ["sms_outbound", "voice_outbound"] } }] }, select: {
          id: true, kind: true, status: true, request: true, requestHash: true,
          account: { select: { provider: true } },
        } }) : [];
    // Legacy test fixtures predate the selected relation and represent the
    // established Google route. Live Prisma rows always include account.
    const draftRows: DraftRow[] = drafts.map(row => ({ ...row, provider: row.account?.provider ?? "google_calendar" }));
    const current = new Map(draftRows.map(row => [row.id, row]));
    return freeze({ schemaVersion: 1 as const, readOnly: true as const, executionAuthorized: false as const, semanticInterpretationVerified: false as const,
      unavailableCount, limit: 20, reviews: validated.map(({ row, review }) => ({ sourceOperationId: row.id, modelChildOperationId: review.modelChildOperationId,
        source: { text: review.source.text, receivedAt: review.source.receivedAt, timezone: review.source.timezone },
        responsible: { userId, role: "OWNER" as const }, accounting: "UNSETTLED" as const, semanticInterpretationVerified: false as const,
        actions: review.actions.map(action => currentAction(action, current)) })) });
  }, { isolationLevel: "Serializable" });
}
