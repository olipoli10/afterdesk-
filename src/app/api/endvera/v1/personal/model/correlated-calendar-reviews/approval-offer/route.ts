import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { correlatedCalendarApprovalOfferSchema, readCorrelatedCalendarApprovalOffer } from "@/server/personal-assistant/correlated-calendar-approval-offer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const enabled = () => process.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED === "true"
  && process.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED === "true";
const json = (body: unknown, status: number) => NextResponse.json(body, { status,
  headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
const disabled = () => json({ error: "Not found." }, 404);
const unavailable = () => json({ error: "La vérification de cette demande est momentanément indisponible." }, 503);
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 191 && value.trim() === value;

/** Read the selected V1 card's exact offer. No approval, fallback card or replay. */
export async function GET(request: Request) {
  if (!enabled()) return disabled();
  const started = performance.now(), deadlineAt = Date.now() + 5000;
  try {
    const signal = request.signal, url = request.url;
    const live = () => { const ms = performance.now() - started; return !signal.aborted && Date.now() < deadlineAt && Number.isFinite(ms) && ms >= 0 && ms < 5000; };
    if (!live()) return unavailable();
    const user = await getSessionUser();
    if (!enabled()) return disabled(); if (!live()) return unavailable();
    if (!user) return json({ error: "Connecte-toi pour continuer." }, 401);
    if (user.role !== "CLIENT" || user.emailVerified !== true || !validId(user.id)) return disabled();
    const userId = user.id;
    let workspaceId: string, reviewId: string;
    try {
      const query = new URL(url).searchParams, workspaces = query.getAll("workspaceId"), reviews = query.getAll("reviewId");
      if ([...query.keys()].some(key => key !== "workspaceId" && key !== "reviewId") || workspaces.length !== 1 || reviews.length !== 1
        || !validId(workspaces[0]) || !validId(reviews[0])) return json({ error: "Dossier et demande requis." }, 400);
      workspaceId = workspaces[0]; reviewId = reviews[0];
    } catch { return json({ error: "Dossier et demande requis." }, 400); }
    const allowed = await consumeRateLimit(`personal-correlated-calendar-approval-offer:${userId}`, { window: 60, max: 30 });
    if (!enabled()) return disabled(); if (!live()) return unavailable();
    if (allowed !== true) return json({ error: "Réessaie dans une minute." }, 429);
    const readStartedAt = performance.now();
    const raw = await readCorrelatedCalendarApprovalOffer({ enabled: true, actor: { userId, workspaceId }, reviewId }, process.env, { deadlineAt, signal });
    if (!enabled()) return disabled(); if (!live()) return unavailable();
    const result = correlatedCalendarApprovalOfferSchema.parse(raw);
    if (result.workspaceId !== workspaceId || result.review.reviewId !== reviewId || result.approvalOffer.reviewId !== reviewId) return unavailable();
    const sinceRead = performance.now() - readStartedAt;
    // Include the entire reader interval conservatively; never use host wall
    // time as the DB clock or rewrite the original expiry/inspection timestamp.
    if (!Number.isFinite(sinceRead) || sinceRead < 0 || Date.parse(result.approvalOffer.inspectedAt) + sinceRead >= Date.parse(result.approvalOffer.approvalExpiresAt)) return unavailable();
    if (!enabled()) return disabled(); if (!live()) return unavailable();
    return json(result, 200);
  } catch { return enabled() ? unavailable() : disabled(); }
}
