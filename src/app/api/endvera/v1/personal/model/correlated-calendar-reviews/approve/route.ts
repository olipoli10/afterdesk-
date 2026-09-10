import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { correlatedCalendarApprovalCommandSchema } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { approveCorrelatedCalendarReview, correlatedCalendarApprovalResponseSchema } from "@/server/personal-assistant/correlated-calendar-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const enabled = () => process.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED === "true"
  && process.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED === "true";
const json = (body: unknown, status: number) => NextResponse.json(body, { status,
  headers: { "cache-control": "private, no-store", vary: "Cookie, Authorization" } });
const disabled = () => json({ error: "Not found." }, 404);
const unknown = () => json({ status: "UNKNOWN", automaticRetry: false,
  error: "Ajout non confirmé. Consulte le résultat enregistré; aucun nouvel essai automatique." }, 503);
const invalid = (status = 400) => json({ error: "Demande invalide." }, status);
const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 191 && id.trim() === id;

/** One explicit command. No fallback to the generic calendar approver, no retry.
 * A late HTTP refusal never changes a known terminal database result. */
export async function POST(request: Request) {
  const startedAt = Date.now(), startedMonotoneAt = performance.now();
  const deadlineAt = startedAt + 25000, monotoneDeadlineAt = startedMonotoneAt + 25000;
  if (!enabled()) return disabled();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let signal: AbortSignal | undefined, stop: (() => void) | undefined;
  let invoked = false;
  try {
    signal = request.signal;
    const originalSignal = signal, url = request.url, body = request.body, method = request.method;
    const origin = request.headers.get("origin"), contentType = request.headers.get("content-type"), length = request.headers.get("content-length");
    const authUrl = process.env.BETTER_AUTH_URL;
    const allowedOrigin = authUrl ? new URL(authUrl).origin : null;
    // Exactly the existing personalApiUser origin policy, including native and
    // absent Origin. These request/config snapshots cannot be swapped at an await.
    const originAllowed = !origin || origin === allowedOrigin || origin === "endvera://";
    const currentOrigin = () => process.env.BETTER_AUTH_URL === authUrl && originAllowed;
    let readStopped = false;
    const live = () => {
      const wall = Date.now(), mono = performance.now();
      return !readStopped && !originalSignal.aborted && Number.isFinite(wall) && Number.isFinite(mono)
        && wall >= startedAt && wall < deadlineAt && mono >= startedMonotoneAt && mono < monotoneDeadlineAt;
    };
    if (!live()) return unknown();
    // Only the body read is raced: an auth/driver promise cannot be forcibly
    // cancelled here. Every continuation checks the same original deadline.
    const stopped = new Promise<never>((_, reject) => {
      stop = () => { readStopped = true; reject(new Error("COMMAND_READ_STOPPED")); };
      originalSignal.addEventListener("abort", stop, { once: true });
      timer = setTimeout(stop, Math.max(1, Math.floor(Math.min(deadlineAt - Date.now(), monotoneDeadlineAt - performance.now()))));
    });
    void stopped.catch(() => undefined);
    const user = await getSessionUser();
    if (!enabled()) return disabled(); if (!live()) return unknown();
    if (!user) return json({ error: "Connecte-toi pour continuer." }, 401);
    if (user.role !== "CLIENT" || user.emailVerified !== true || !validId(user.id)) return disabled();
    const userId = user.id;
    if (!originAllowed) return json({ error: "Demande refusée." }, 403);
    if (!currentOrigin()) return unknown();
    if (method !== "POST" || new URL(url).search !== "") return invalid();
    if (!contentType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) return invalid(415);
    if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) return invalid();
    if (length !== null && Number(length) > 4096) return invalid(413);
    const allowed = await consumeRateLimit(`personal-correlated-calendar-approve:${userId}`, { window: 60, max: 20 });
    if (!enabled()) return disabled(); if (!live() || !currentOrigin()) return unknown();
    if (allowed !== true) return json({ error: "Trop de demandes. Aucun nouvel essai automatique." }, 429);
    if (!body) return invalid();
    const reader = body.getReader(), chunks: Uint8Array[] = [];
    let size = 0, chunkCount = 0, complete = false;
    let raw: unknown;
    try {
      for (;;) {
        if (!live() || !enabled() || !currentOrigin()) return unknown();
        const next = await Promise.race([reader.read(), stopped]);
        if (!live() || !enabled() || !currentOrigin()) return unknown();
        if (next.done) { complete = true; break; }
        if (++chunkCount > 4096) return invalid();
        size += next.value.byteLength;
        if (size > 4096) return invalid(413);
        // Buffer.slice() aliases its backing memory, unlike Uint8Array.slice().
        // Own every byte before another producer pull can mutate its chunk.
        if (next.value.byteLength) chunks.push(Uint8Array.from(next.value));
      }
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      return !live() || !enabled() || !currentOrigin() ? unknown() : invalid();
    } finally {
      // A malicious stream's cancel promise must not hold the HTTP response open.
      if (!complete) { try { void reader.cancel().catch(() => undefined); } catch { /* already closed */ } }
      try { reader.releaseLock(); } catch { /* an outstanding read is being cancelled */ }
    }
    const parsed = correlatedCalendarApprovalCommandSchema.safeParse(raw);
    if (!parsed.success) return invalid();
    const command = parsed.data, actor = Object.freeze({ userId, workspaceId: command.workspaceId });
    if (!enabled()) return disabled(); if (!live() || !currentOrigin()) return unknown();
    invoked = true;
    const result = await approveCorrelatedCalendarReview(command, actor, process.env, { deadlineAt, monotoneDeadlineAt, signal: originalSignal });
    if (!enabled() || !live() || !currentOrigin()) return unknown();
    const output = correlatedCalendarApprovalResponseSchema.parse(result);
    if (output.workspaceId !== command.workspaceId || output.reviewId !== command.reviewId
      || output.expectedRequestHash !== command.expectedRequestHash || output.expectedReviewFingerprint !== command.expectedReviewFingerprint) return unknown();
    if (!enabled() || !live() || !currentOrigin()) return unknown();
    return json(output, 200);
  } catch { return !invoked && !enabled() ? disabled() : unknown(); }
  finally { if (timer !== undefined) clearTimeout(timer); if (signal && stop) signal.removeEventListener("abort", stop); }
}
