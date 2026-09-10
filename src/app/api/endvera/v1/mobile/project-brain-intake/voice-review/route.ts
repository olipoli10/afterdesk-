import { NextResponse } from "next/server";
import { performance } from "node:perf_hooks";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { assertProjectBrainVoiceTranscriptReviewPublication, readProjectBrainVoiceTranscriptReview } from "@/server/model-gateway/voice/project-brain-transcript-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const enabled = () => process.env.ENDVERA_PROJECT_BRAIN_VOICE_REVIEW_ENABLED === "true";
const queryFields = new Set(["workspaceId", "sessionId"]);
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
}
const unavailable = () => json({ error: "Voice review is unavailable." }, 503);
const disabled = () => json({ error: "Not found." }, 404);

/** Protected read only. This switch does not enable model processing, consent,
 * source interpretation, a provider transport or any project fact confirmation. */
export async function GET(request: Request) {
  if (!enabled()) return disabled();
  try {
    const startedAt = Date.now(), startedMonotoneAt = performance.now();
    const context = Object.freeze({ deadlineAt: startedAt + 10_000,
      monotoneDeadlineAt: startedMonotoneAt + 10_000, signal: request.signal });
    let lastWall = startedAt, lastMonotone = startedMonotoneAt;
    const live = () => {
      const wall = Date.now(), monotone = performance.now();
      if (!Number.isFinite(startedAt) || !Number.isFinite(startedMonotoneAt)
        || !Number.isFinite(wall) || !Number.isFinite(monotone)
        || wall < lastWall || monotone < lastMonotone || context.signal?.aborted
        || wall >= context.deadlineAt || monotone >= context.monotoneDeadlineAt) {
        throw new Error("VOICE_REVIEW_DISCLOSURE_UNAVAILABLE");
      }
      lastWall = wall; lastMonotone = monotone;
    };
    // This is a publication bound, not a claim that auth/Prisma can be forcibly
    // cancelled. Never race or retry their work; refuse after it settles.
    live();
    const user = await getSessionUser();
    if (!enabled()) return disabled();
    live();
    if (!user) return json({ error: "Not signed in." }, 401);
    if (user.role !== "CLIENT" || user.emailVerified !== true || typeof user.id !== "string" || !user.id || user.id.length > 200) return disabled();
    const actorUserId = user.id;
    let workspaceId: string, sessionId: string;
    try {
      const query = new URL(request.url).searchParams;
      for (const key of query.keys()) if (!queryFields.has(key)) return json({ error: "Invalid query." }, 400);
      const values = ["workspaceId", "sessionId"].map(key => query.getAll(key));
      if (values.some(parts => parts.length !== 1 || !parts[0] || parts[0].trim() !== parts[0] || parts[0].length > 200)) {
        return json({ error: "Invalid query." }, 400);
      }
      [workspaceId, sessionId] = [values[0][0], values[1][0]];
    } catch { return json({ error: "Invalid query." }, 400); }
    const allowed = await consumeRateLimit(`construction-mobile-project-brain-voice-review:${actorUserId}`, { window: 60, max: 60 });
    if (!enabled()) return disabled();
    live();
    if (allowed !== true) return json({ error: "Too many requests." }, 429);
    // The reader itself reloads the current PB owner and all protected lineage.
    // Application CLIENT does not stand in for the legacy voice CLIENT subject.
    const result = await readProjectBrainVoiceTranscriptReview({ actorUserId, workspaceId, sessionId }, { enabled: true }, context);
    if (!enabled()) return disabled();
    live();
    if (result.status !== "SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED" || result.executionAuthorized !== false
      || result.externalTransportPerformed !== false || result.automaticConfirmationPerformed !== false
      || result.transcriptionQualityVerified !== false || result.realTranscriptionAvailable !== false
      || result.projectFactConfirmed !== false || result.processingMode !== "SYNTHETIC_LOCAL"
      || result.contentIntegrityVerified !== true || result.semanticAccuracyVerified !== false
      || result.mediaDecodingVerified !== false || result.syntheticReviewAvailable !== true
      || result.workspaceId !== workspaceId || result.sessionId !== sessionId) return unavailable();
    live();
    assertProjectBrainVoiceTranscriptReviewPublication(result);
    const response = json(result, 200);
    if (!enabled()) return disabled();
    live();
    assertProjectBrainVoiceTranscriptReviewPublication(result);
    return response;
  } catch {
    // Authentication, rate-limit, database and serialization exceptions are all
    // opaque. Do not log or serialize errors that may contain protected text/SQL.
    return enabled() ? unavailable() : disabled();
  }
}
