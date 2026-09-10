import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), offer: vi.fn(), execute: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-gate", () => ({ inspectCorrelatedCalendarApprovalOfferInTransaction: m.offer }));
vi.mock("@/server/personal-assistant/calendar-actions", () => ({ executeClaimedPersonalCalendarWrite: m.execute }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-result", async importOriginal => ({ ...await importOriginal<object>(), readCorrelatedCalendarApprovalResult: m.history }));
import { approveCorrelatedCalendarReview as approve, correlatedCalendarApprovalResponseSchema as schema } from "@/server/personal-assistant/correlated-calendar-approval";
import { fingerprintCorrelatedCalendarApprovalView, type CorrelatedCalendarApprovalCommand } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { deterministicGoogleEventId } from "@/lib/construction-operating-assistant-r3/google-calendar";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { GOOGLE_CALENDAR_WRITE_SCOPE as WRITE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import type { GoogleCalendarClient } from "@/server/personal-assistant/google-client";

const now = "2026-09-11T04:02:00.000Z";
function fixture() {
  const actor = { userId: "owner", workspaceId: "workspace" }, request = { title: "Inspection", startsAt: "2026-09-12T18:00:00.000Z", endsAt: "2026-09-12T19:00:00.000Z", timezone: "America/Toronto", accountVersion: 1, requestId: personalCorrelatedCalendarRequestId("receipt") };
  const expectedRequestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const { view, fingerprint } = fingerprintCorrelatedCalendarApprovalView({ version: "personal-correlated-calendar-approval-view-v1", scope: actor,
    review: { reviewId: "review", receiptId: "receipt", reviewVersion: "personal-sms-correlated-calendar-review-v1", packetHash: "a".repeat(64), proofHash: "b".repeat(64) },
    request: { calendarRequestId: request.requestId, calendarRequestHash: expectedRequestHash, connectorAccountId: "calendar", accountVersion: 1 },
    presentation: { itemVersion: "personal-correlated-calendar-review-v1", evidenceVersion: "personal-correlated-calendar-local-preview-v1", titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } });
  const command: CorrelatedCalendarApprovalCommand = { version: "personal-correlated-calendar-approval-command-v1", workspaceId: "workspace", reviewId: "review", expectedRequestHash, expectedReviewFingerprint: fingerprint };
  const authority = { accountId: "calendar", accountVersion: 1, credentialId: "credential", writeGrantId: "write", writeGrantVersion: 1, memberId: "member", memberRole: "owner",
    memberUpdatedAt: "2026-09-10T02:00:00.000Z", workspaceUpdatedAt: "2026-09-10T02:00:00.000Z", accountScopes: [WRITE], grantScopes: [WRITE] };
  const expiry = "2026-09-11T04:08:00.000Z";
  const env: Record<string, string> = { ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED: "true", ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true",
    ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_EXTERNAL_OWNER_REF: "synthetic", ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic",
    GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const discovery = { view, approvalPresent: false, reviewCommitted: true, operationCommitted: true, approvalCommitted: null as boolean | null, binding: null as boolean | null,
    stateValid: null as boolean | null, status: "pending", phase: null as string | null, attempts: 0, leaseMatches: null as boolean | null, leaseIsNull: true, resultIsNull: true, externalTransportPerformed: false };
  const state = { inTx: false, commits: 0, commitHookReached: false, loseCommit: false, changed: 1, hook: async (_stage: string) => { void _stage; } };
  const query = vi.fn(async (sql: string, ...args: unknown[]) => {
    const stage = sql.startsWith("SELECT current_setting") ? "isolation" : sql.startsWith("SELECT set_config") ? "timeouts" : sql.startsWith("SELECT sms_correlated_approval_view") ? "discovery" : sql.startsWith("SELECT o.id") ? "lock" : sql.startsWith("INSERT INTO") ? "insert" : "clock";
    await state.hook(stage);
    if (stage === "isolation") return [{ isolation: "serializable" }];
    if (stage === "timeouts") return [];
    if (stage === "discovery") return [discovery];
    if (stage === "lock") return [{ id: "operation" }];
    if (stage === "insert") return [{ id: args[0], approvedAt: new Date(Date.parse(now) + 10), approvalExpiresAt: new Date(expiry), leaseUntil: new Date(Math.min(Date.parse(now) + 20000, Date.parse(args[9] as string))) }];
    return [{ now: new Date(Date.parse(now) + 20) }];
  });
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: vi.fn(async () => state.changed) };
  m.transaction.mockImplementation(async (work: (db: typeof tx) => Promise<unknown>, options) => {
    expect(options.maxWait + options.timeout).toBeLessThanOrEqual(5000); state.inTx = true;
    try { const result = await work(tx); state.commitHookReached = true; await state.hook("commit"); if (state.loseCommit) throw new Error("synthetic commit lost"); state.commits++; return result; }
    finally { state.inTx = false; }
  });
  m.offer.mockResolvedValue({ status: "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED", committed: false, executionAuthorized: false, actor: { ...actor }, operationId: "operation", view, fingerprint, request, authority, inspectedAt: now, approvalExpiresAt: expiry });
  const receipt = { confirmed: true as const, providerEventId: deterministicGoogleEventId({ workspaceId: "workspace", calendarItemId: request.requestId, idempotencyKey: request.requestId }) };
  m.execute.mockImplementation(async () => { expect(state.inTx).toBe(false); expect(state.commits).toBe(1); await state.hook("execute"); return receipt; });
  const historical = { version: "personal-correlated-calendar-approval-result-v1", workspaceId: "workspace", reviewId: "review", observedAt: now,
    readOnly: true, approvalAvailable: false, executionAuthorized: false, automaticRetry: false, providerStateVerified: false,
    outcome: "PENDING_RESULT", approvedAt: now };
  m.history.mockImplementation(async () => { expect(state.inTx).toBe(false); expect(state.commits).toBe(1); return historical; });
  const client = {} as GoogleCalendarClient;
  const run = (context: { deadlineAt: number; monotoneDeadlineAt?: number; signal?: AbortSignal } = { deadlineAt: Date.now() + 25000 }) => approve(command, actor, env, context, client);
  const replay = () => Object.assign(discovery, { approvalPresent: true, approvalCommitted: true, binding: true, stateValid: true, status: "processing", phase: "CLAIMED", attempts: 1, leaseMatches: true, leaseIsNull: false, resultIsNull: false });
  return { run, replay, command, actor, env, state, tx, query, receipt, historical, client };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("C2c wrapper uses real C2b claim, mocked current gate/executor/history", () => {
  it("dispatches only after claim commit and publishes exact scoped wire without handles", async () => { const h = fixture(), result = await h.run();
    expect(result).toEqual({ version: "personal-correlated-calendar-approval-response-v1", status: "CONFIRMED", workspaceId: "workspace", reviewId: "review",
      expectedReviewFingerprint: h.command.expectedReviewFingerprint, expectedRequestHash: h.command.expectedRequestHash, receipt: h.receipt, executionAuthorized: false, providerStateVerified: false, automaticRetry: false });
    expect(schema.parse(result)).toEqual(result); expect(Object.isFrozen(result)).toBe(true); expect(m.execute).toHaveBeenCalledOnce(); expect(m.history).not.toHaveBeenCalled();
    expect(m.execute.mock.calls[0][2]).toBe(h.client); expect(m.execute.mock.calls[0][3].deadlineAt).toBe(Date.parse(now) + 25000);
    expect(JSON.stringify(result)).not.toMatch(/approvalToken|credentialId|writeAuthority|committed|operationId/);
  });
  it("OFF returns before parsing or any DB work", async () => { const h = fixture(); h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED = "false";
    Object.assign(h.command, { workspaceId: null }); expect(await h.run()).toEqual({ status: "DISABLED", executionAuthorized: false }); expect(m.transaction).not.toHaveBeenCalled(); });
  it("foreign actor refuses before DB", async () => { const h = fixture(); h.actor.workspaceId = "foreign"; await expect(h.run()).rejects.toThrow(); expect(m.transaction).not.toHaveBeenCalled(); });
  it.each([true, false])("commit failure (provisional claim present=%s) never executes or reads history", async didClaim => { const h = fixture(); h.state.loseCommit = didClaim; if (!didClaim) h.state.changed = 0;
    await expect(h.run()).rejects.toThrow("COMMIT_OUTCOME_UNKNOWN"); expect(m.execute).not.toHaveBeenCalled(); expect(m.history).not.toHaveBeenCalled(); expect(m.transaction).toHaveBeenCalledOnce(); });
  it("exact replay reads C3 after tx without executor, offer or renewed provider authority", async () => { const h = fixture(); h.replay(); h.env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED = "false"; h.env.ENDVERA_GOOGLE_OAUTH_ENABLED = "OFF";
    const result = await h.run(); expect(result).toMatchObject({ status: "ALREADY_ATTEMPTED", result: h.historical }); expect(m.execute).not.toHaveBeenCalled(); expect(m.offer).not.toHaveBeenCalled(); expect(m.history).toHaveBeenCalledOnce(); });
  it.each(["workspaceId", "reviewId"])("foreign historical %s is never published", async key => { const h = fixture(); h.replay(); Object.assign(h.historical, { [key]: "foreign" }); await expect(h.run()).rejects.toThrow(); expect(m.execute).not.toHaveBeenCalled(); });
  it("unknown executor outcome propagates without history retry", async () => { const h = fixture(); m.execute.mockRejectedValue(new Error("CALENDAR_WRITE_OUTCOME_UNKNOWN")); await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(m.execute).toHaveBeenCalledOnce(); expect(m.history).not.toHaveBeenCalled(); });
  it("known terminal commit arriving late stays a scoped recorded confirmation", async () => { const h = fixture(); h.state.hook = async stage => { if (stage === "execute") vi.setSystemTime(Date.parse(now) + 30000); };
    expect(await h.run()).toMatchObject({ status: "CONFIRMED", receipt: h.receipt, executionAuthorized: false }); });
  it("claim commit resolving after original deadline never starts executor", async () => { const h = fixture(); h.state.hook = async stage => { if (stage === "commit") vi.setSystemTime(Date.parse(now) + 30000); };
    await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(h.state.commits).toBe(1); expect(m.execute).not.toHaveBeenCalled(); });
  it("retains entry monotone budget through auth/body elapsed time and claim", async () => { const h = fixture(); let mono = 100; vi.spyOn(performance, "now").mockImplementation(() => mono);
    h.state.hook = async stage => { if (stage === "commit") { mono = 200; vi.setSystemTime(Date.parse(now) - 3600000); } };
    await expect(h.run({ deadlineAt: Date.parse(now) + 25000, monotoneDeadlineAt: 150 })).rejects.toThrow(/^CORRELATED_CALENDAR_APPROVAL_OUTCOME_UNKNOWN$/);
    expect(h.state.commitHookReached).toBe(true); expect(h.state.commits).toBe(1); expect(m.execute).not.toHaveBeenCalled(); });
  it("never extends exact original monotone deadline across successive clock samples", async () => { const h = fixture(); let mono = 100; vi.spyOn(performance, "now").mockImplementation(() => mono++);
    await h.run({ deadlineAt: Date.parse(now) + 25000, monotoneDeadlineAt: 24100 }); expect(m.execute).toHaveBeenCalledOnce(); expect(m.execute.mock.calls[0][3].monotoneDeadlineAt).toBeLessThanOrEqual(24100); });
  it("snapshots command/actor and retains original signal before first await", async () => { const h = fixture(), c = new AbortController(), replacement = new AbortController();
    const context = { deadlineAt: Date.parse(now) + 25000, signal: c.signal }; h.state.hook = async stage => { if (stage === "isolation") { h.command.reviewId = "foreign"; h.actor.userId = "foreign"; context.signal = replacement.signal; } };
    const result = await h.run(context); expect(result).toMatchObject({ reviewId: "review" }); expect(m.execute.mock.calls[0][3].signal).toBe(c.signal); });
  it.each(["approvalToken", "committed", "operationId", "draft"])("response rejects extra %s", async key => { const h = fixture(), result = await h.run(); expect(schema.safeParse({ ...result, [key]: "forged" }).success).toBe(false); });
  it.each(["automaticRetry", "executionAuthorized", "providerStateVerified"])("response rejects true %s", async key => { const h = fixture(), result = await h.run(); expect(schema.safeParse({ ...result, [key]: true }).success).toBe(false); });
});
