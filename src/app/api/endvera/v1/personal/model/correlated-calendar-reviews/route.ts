import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { correlatedCalendarReviewListResponseSchema, readCorrelatedPersonalCalendarReviewList } from "@/server/model-gateway/personal-intent/correlated-calendar-review-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const enabled = () => process.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED === "true";
const json = (body: unknown, status: number) => NextResponse.json(body, { status,
  headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
const disabled = () => json({ error: "Not found." }, 404);
const unavailable = () => json({ error: "Les demandes sont momentanément indisponibles." }, 503);

/** Private read only. The same owner-scoped database reader validates empty and
 * nonempty lists; neither route parameters nor a model can supply an actor. */
export async function GET(request: Request) {
  if (!enabled()) return disabled();
  const deadlineAt = Date.now() + 5000;
  const live = () => !request.signal.aborted && Date.now() < deadlineAt;
  try {
    if (!live()) return unavailable();
    const user = await getSessionUser();
    if (!enabled()) return disabled();
    if (!live()) return unavailable();
    if (!user) return json({ error: "Connecte-toi pour continuer." }, 401);
    if (user.role !== "CLIENT" || user.emailVerified !== true || typeof user.id !== "string"
      || !user.id || user.id.length > 191 || user.id.trim() !== user.id) return disabled();
    const userId = user.id;
    let workspaceId: string;
    try {
      const query = new URL(request.url).searchParams;
      const values = query.getAll("workspaceId");
      if ([...query.keys()].some(key => key !== "workspaceId") || values.length !== 1
        || !values[0] || values[0].length > 191 || values[0].trim() !== values[0]) {
        return json({ error: "Dossier requis." }, 400);
      }
      workspaceId = values[0];
    } catch { return json({ error: "Dossier requis." }, 400); }
    const allowed = await consumeRateLimit(`personal-correlated-calendar-reviews:${userId}`, { window: 60, max: 30 });
    if (!enabled()) return disabled();
    if (!live()) return unavailable();
    if (allowed !== true) return json({ error: "Réessaie dans une minute." }, 429);
    const raw = await readCorrelatedPersonalCalendarReviewList({ enabled: true, actor: { userId, workspaceId } }, process.env,
      { deadlineAt, signal: request.signal });
    if (!enabled()) return disabled();
    if (!live()) return unavailable();
    const result = correlatedCalendarReviewListResponseSchema.parse(raw);
    if (result.workspaceId !== workspaceId) return unavailable();
    return json(result, 200);
  } catch {
    // Protected texts, database errors and provider metadata are never logged
    // or echoed; a failed inspection is not a successful empty collection.
    return enabled() ? unavailable() : disabled();
  }
}
