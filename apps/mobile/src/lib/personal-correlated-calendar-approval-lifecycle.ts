import { correlatedApprovalId, parsePersonalCorrelatedCalendarApprovalOffer, parsePersonalCorrelatedCalendarApprovalResult,
  parsePersonalCorrelatedCalendarApprovalResponse, personalCorrelatedCalendarApprovalCommand,
  type PersonalCorrelatedCalendarApprovalOffer, type PersonalCorrelatedCalendarApprovalResult, type PersonalCorrelatedCalendarApprovalResponse,
  type PersonalCorrelatedCalendarApprovalCommand } from "./personal-correlated-calendar-approval";
import type { createCorrelatedCalendarApprovalAttempts, CorrelatedCalendarAttemptMarker } from "./personal-correlated-calendar-approval-attempts";

type Attempts = ReturnType<typeof createCorrelatedCalendarApprovalAttempts>;
export type CorrelatedApprovalSnapshot = Readonly<{ phase: "PAUSED" | "LOADING" | "IDLE" | "OFFER" | "SENDING" | "RESULT" | "UNKNOWN" | "EXPIRED" | "UNAVAILABLE";
  selectedReviewId: string | null; offer: PersonalCorrelatedCalendarApprovalOffer | null;
  result: PersonalCorrelatedCalendarApprovalResult | PersonalCorrelatedCalendarApprovalResponse | null;
  markers: readonly CorrelatedCalendarAttemptMarker[]; capacityBlocked: boolean }>;
/** One fixed authenticated session/workspace per instance. Server reads and
 * durable markers remain distinct; no automatic POST or rearming after unknown. */
export function createCorrelatedCalendarApprovalLifecycle(input: {
  workspaceId: string; attempts: Attempts; isCurrentScope: () => boolean;
  readOffer: (reviewId: string, signal: AbortSignal) => Promise<unknown>;
  readResult: (reviewId: string, signal: AbortSignal) => Promise<unknown>;
  approve: (command: PersonalCorrelatedCalendarApprovalCommand, signal: AbortSignal) => Promise<unknown>;
  wallNow?: () => number; monotoneNow?: () => number;
}) {
  const workspaceId = correlatedApprovalId.parse(input.workspaceId), attempts = input.attempts, scope = input.isCurrentScope;
  const readOffer = input.readOffer, readResult = input.readResult, approve = input.approve;
  const wall = input.wallNow ?? Date.now, mono = input.monotoneNow ?? (() => performance.now());
  let active = false, generation = 0, controller: AbortController | null = null, timer: ReturnType<typeof setTimeout> | null = null;
  let offerWall = 0, offerMono = 0, offerDeadline = 0;
  let snapshot: CorrelatedApprovalSnapshot = Object.freeze({ phase: "PAUSED", selectedReviewId: null, offer: null, result: null, markers: Object.freeze([]), capacityBlocked: false });
  const listeners = new Set<() => void>();
  const publish = (delta: Partial<CorrelatedApprovalSnapshot>) => { snapshot = Object.freeze({ ...snapshot, ...delta }); listeners.forEach(listener => listener()); };
  const cancel = () => { generation++; controller?.abort(); controller = null; if (timer !== null) clearTimeout(timer); timer = null; };
  const current = (epoch: number, signal: AbortSignal) => active && scope() && generation === epoch && !signal.aborted;
  const fresh = (offer: PersonalCorrelatedCalendarApprovalOffer) => {
    const w = wall(), m = mono(); return Number.isFinite(w) && Number.isFinite(m) && w >= offerWall && m >= offerMono
      && w < Date.parse(offer.approvalOffer.approvalExpiresAt) && m < offerDeadline;
  };
  function begin(reviewId: string) {
    if (!active || !scope()) return null;
    cancel(); const pending = new AbortController(); controller = pending;
    const epoch = generation, id = correlatedApprovalId.parse(reviewId);
    publish({ phase: "LOADING", selectedReviewId: id, offer: null, result: null });
    return { id, epoch, signal: pending.signal };
  }
  async function hydrate() {
    cancel(); const epoch = generation, pending = new AbortController(); controller = pending;
    publish({ phase: "LOADING", offer: null, result: null, selectedReviewId: null, markers: Object.freeze([]) });
    if (!current(epoch, pending.signal)) return;
    try { const markers = await attempts.load(); if (current(epoch, pending.signal)) publish({ phase: "IDLE", markers: Object.freeze(markers.filter(m => m.workspaceId === workspaceId)) }); }
    catch { if (current(epoch, pending.signal)) publish({ phase: "UNAVAILABLE", capacityBlocked: true }); }
  }
  async function select(reviewId: string) {
    if (snapshot.phase === "SENDING" || snapshot.capacityBlocked) return;
    const selected = begin(reviewId); if (!selected || !current(selected.epoch, selected.signal)) return;
    try {
      // A fresh process cannot infer no prior attempt from a missing local marker.
      const rawHistory = await readResult(selected.id, selected.signal); if (!current(selected.epoch, selected.signal)) return;
      const history = parsePersonalCorrelatedCalendarApprovalResult(rawHistory, workspaceId, selected.id); if (!current(selected.epoch, selected.signal)) return;
      if (history.outcome !== "NOT_ATTEMPTED" || attempts.has(workspaceId, selected.id)) { publish({ phase: "RESULT", result: history }); return; }
      const startedWall = wall(), startedMono = mono();
      if (!Number.isFinite(startedWall) || !Number.isFinite(startedMono)) throw new Error("INVALID_CLOCK");
      const rawOffer = await readOffer(selected.id, selected.signal); if (!current(selected.epoch, selected.signal)) return;
      const offer = parsePersonalCorrelatedCalendarApprovalOffer(rawOffer, workspaceId, selected.id); if (!current(selected.epoch, selected.signal)) return;
      offerWall = startedWall; offerMono = startedMono;
      offerDeadline = startedMono + Date.parse(offer.approvalOffer.approvalExpiresAt) - Date.parse(offer.approvalOffer.inspectedAt);
      if (!fresh(offer)) { publish({ phase: "EXPIRED" }); return; }
      const delay = Math.min(offerDeadline - mono(), Date.parse(offer.approvalOffer.approvalExpiresAt) - wall(), 2_147_483_647);
      timer = setTimeout(() => { if (current(selected.epoch, selected.signal)) { const sent = snapshot.phase === "SENDING"; cancel(); publish({ phase: sent ? "UNKNOWN" : "EXPIRED", offer: null, result: null }); } }, Math.max(1, delay));
      publish({ phase: "OFFER", offer, result: null });
    } catch { if (current(selected.epoch, selected.signal)) publish({ phase: "UNAVAILABLE", offer: null, result: null }); }
  }
  async function send() {
    const offer = snapshot.offer, pending = controller, epoch = generation;
    if (snapshot.phase !== "OFFER" || !offer || !pending || !current(epoch, pending.signal)) return;
    if (!fresh(offer)) { cancel(); publish({ phase: "EXPIRED", offer: null }); return; }
    const command = personalCorrelatedCalendarApprovalCommand(offer);
    // This synchronous state change prevents a second tap before storage awaits.
    publish({ phase: "SENDING", result: null });
    if (!current(epoch, pending.signal)) return;
    try {
      const marker = await attempts.reserve(command, { signal: pending.signal, isCurrent: () => current(epoch, pending.signal) && fresh(offer) });
      if (!current(epoch, pending.signal)) return;
      publish({ markers: Object.freeze([...snapshot.markers.filter(m => m.reviewId !== marker.reviewId), marker]) });
      if (!current(epoch, pending.signal)) return;
      if (!fresh(offer)) { cancel(); publish({ phase: "EXPIRED", offer: null }); return; }
      const raw = await approve(command, pending.signal); if (!current(epoch, pending.signal)) return;
      if (!fresh(offer)) { cancel(); publish({ phase: "UNKNOWN", offer: null, result: null }); return; }
      const result = parsePersonalCorrelatedCalendarApprovalResponse(raw, command); if (!current(epoch, pending.signal)) return;
      if (!fresh(offer)) { cancel(); publish({ phase: "UNKNOWN", offer: null, result: null }); return; }
      cancel(); publish({ phase: "RESULT", result, offer: null });
    } catch (error) {
      if (current(epoch, pending.signal)) {
        cancel(); publish({ phase: "UNKNOWN", offer: null, result: null,
          capacityBlocked: snapshot.capacityBlocked || error instanceof Error && error.message === "CORRELATED_ATTEMPT_CAPACITY" });
      }
    } finally {
      // A write can settle after the offer timer invalidated this request. Recover
      // metadata only for that same still-visible selection, never a new scope or
      // selection and never a new send/offer. The expired source text stays hidden.
      const relevant = () => active && scope() && generation === epoch + 1 && snapshot.selectedReviewId === command.reviewId
        && (snapshot.phase === "UNKNOWN" || snapshot.phase === "EXPIRED");
      if (relevant()) { try { const markers = await attempts.load(); if (relevant()) publish({ markers: Object.freeze(markers.filter(m => m.workspaceId === workspaceId)) }); } catch { /* keep unknown and local latch */ } }
    }
  }
  async function history(reviewId: string) {
    if (snapshot.phase === "SENDING") return;
    const selected = begin(reviewId); if (!selected || !current(selected.epoch, selected.signal)) return;
    try { const raw = await readResult(selected.id, selected.signal); if (!current(selected.epoch, selected.signal)) return;
      const result = parsePersonalCorrelatedCalendarApprovalResult(raw, workspaceId, selected.id); if (current(selected.epoch, selected.signal)) publish({ phase: "RESULT", result });
    } catch { if (current(selected.epoch, selected.signal)) publish({ phase: "UNKNOWN", result: null }); }
  }
  async function dismiss(reviewId: string) {
    if (snapshot.phase === "SENDING") return;
    const selected = begin(reviewId); if (!selected || !current(selected.epoch, selected.signal)) return;
    try {
      // Explicit dismissal re-reads C3 now; a cached POST receipt/local DTO cannot
      // authorize marker deletion, and UNKNOWN/PENDING never qualify.
      const raw = await readResult(selected.id, selected.signal); if (!current(selected.epoch, selected.signal)) return;
      const result = parsePersonalCorrelatedCalendarApprovalResult(raw, workspaceId, selected.id);
      if (!current(selected.epoch, selected.signal)) return;
      if (result.outcome !== "CONFIRMED") { publish({ phase: "RESULT", result }); return; }
      const markers = await attempts.dismissConfirmed(result, { signal: selected.signal, isCurrent: () => current(selected.epoch, selected.signal) });
      if (current(selected.epoch, selected.signal)) publish({ phase: "RESULT", result, markers: Object.freeze(markers.filter(m => m.workspaceId === workspaceId)) });
    } catch { if (current(selected.epoch, selected.signal)) publish({ phase: "UNKNOWN", result: null }); }
  }
  return Object.freeze({ select, send, history, dismiss,
    getSnapshot() {
      if (!active || !scope()) {
        if (snapshot.phase !== "PAUSED" || snapshot.markers.length || snapshot.selectedReviewId !== null || snapshot.result !== null) {
          active = false; cancel(); snapshot = Object.freeze({ ...snapshot, phase: "PAUSED", offer: null, result: null, markers: Object.freeze([]), selectedReviewId: null });
        }
        return snapshot;
      }
      if (snapshot.offer && (!active || !scope() || !fresh(snapshot.offer))) { const sent = snapshot.phase === "SENDING"; cancel(); snapshot = Object.freeze({ ...snapshot, phase: sent ? "UNKNOWN" : "EXPIRED", offer: null, result: null }); }
      return snapshot;
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    activate() { if (!active) { active = true; void hydrate(); } },
    pause() { active = false; cancel(); publish({ phase: "PAUSED", offer: null, result: null, markers: Object.freeze([]), selectedReviewId: null }); },
  });
}
