import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { correlatedCalendarApprovalResultSchema, readCorrelatedCalendarApprovalResult } from "@/server/personal-assistant/correlated-calendar-approval-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const enabled = () => process.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED === "true";
const json = (body: unknown, status: number) => NextResponse.json(body, { status,
  headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
const disabled = () => json({ error: "Not found." }, 404);
const unavailable = () => json({ error: "Le résultat est momentanément indisponible." }, 503);
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 191 && value.trim() === value;
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

/** Historical read only. No claim, replay, provider lookup or active pilot gate.
 * Deadlines prevent late disclosure; they cannot forcibly cancel hung auth. */
export async function GET(request: Request) {
  if (!enabled()) return disabled();
  const deadlineAt = Date.now() + 5000, started = performance.now();
  try {
    const signal = request.signal, url = request.url;
    const live = () => {
      const elapsed = performance.now() - started;
      return !signal.aborted && Date.now() < deadlineAt && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 5000;
    };
    if (!live()) return unavailable();
    const user = await getSessionUser();
    if (!enabled()) return disabled();
    if (!live()) return unavailable();
    if (!user) return json({ error: "Connecte-toi pour continuer." }, 401);
    if (user.role !== "CLIENT" || user.emailVerified !== true || !validId(user.id)) return disabled();
    const userId = user.id;
    let workspaceId: string, reviewId: string;
    try {
      const query = new URL(url).searchParams, workspaces = query.getAll("workspaceId"), reviews = query.getAll("reviewId");
      if ([...query.keys()].some(key => key !== "workspaceId" && key !== "reviewId")
        || workspaces.length !== 1 || reviews.length !== 1 || !validId(workspaces[0]) || !validId(reviews[0])) {
        return json({ error: "Dossier et demande requis." }, 400);
      }
      workspaceId = workspaces[0]; reviewId = reviews[0];
    } catch { return json({ error: "Dossier et demande requis." }, 400); }
    const allowed = await consumeRateLimit(`personal-correlated-calendar-approval-result:${userId}`, { window: 60, max: 30 });
    if (!enabled()) return disabled();
    if (!live()) return unavailable();
    if (allowed !== true) return json({ error: "Réessaie dans une minute." }, 429);
    const raw = await readCorrelatedCalendarApprovalResult({ enabled: true, actor: { userId, workspaceId }, reviewId }, process.env,
      { deadlineAt, signal });
    if (!enabled()) return disabled();
    if (!live()) return unavailable();
    const result = freeze(correlatedCalendarApprovalResultSchema.parse(raw));
    if (result.workspaceId !== workspaceId || result.reviewId !== reviewId) return unavailable();
    if (!enabled()) return disabled();
    if (!live()) return unavailable();
    return json(result, 200);
  } catch {
    // No SQL, error text, protected metadata or replay handle is echoed/logged.
    return enabled() ? unavailable() : disabled();
  }
}
