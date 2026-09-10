import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-gate", () => ({ inspectCorrelatedCalendarApprovalOfferInTransaction: mocks.gate }));
import { createCorrelatedCalendarApprovalClaimBudget, claimCorrelatedCalendarApprovalInTransaction } from "@/server/personal-assistant/correlated-calendar-approval";
import { fingerprintCorrelatedCalendarApprovalView, inspectCorrelatedCalendarApprovalState } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import type { TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";

// Real command/claim/state contracts; gate and SQL transport are synthetic.
// This harness does not emulate PostgreSQL constraints, locks or commit rollback.
const wall = Date.parse("2026-09-11T04:02:00.000Z");
function fixture(dbOffset = 0) {
  let monotone = 100;
  vi.spyOn(performance, "now").mockImplementation(() => monotone);
  const actor = { userId: "owner-é", workspaceId: "workspace" };
  const request = { title: "Inspection e\u0301 🛠️", startsAt: "2026-09-12T18:00:00.000Z", endsAt: "2026-09-12T19:00:00.000Z", timezone: "America/Toronto", accountVersion: 1,
    requestId: personalCorrelatedCalendarRequestId("receipt-review") };
  const hash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const proof = fingerprintCorrelatedCalendarApprovalView({ version: "personal-correlated-calendar-approval-view-v1", scope: actor,
    review: { reviewId: "review", receiptId: "receipt-review", reviewVersion: "personal-sms-correlated-calendar-review-v1", packetHash: "a".repeat(64), proofHash: "b".repeat(64) },
    request: { calendarRequestId: request.requestId, calendarRequestHash: hash, connectorAccountId: "calendar", accountVersion: 1 },
    presentation: { itemVersion: "personal-correlated-calendar-review-v1", evidenceVersion: "personal-correlated-calendar-local-preview-v1", titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } });
  const command = { version: "personal-correlated-calendar-approval-command-v1" as const, workspaceId: actor.workspaceId, reviewId: "review", expectedRequestHash: hash, expectedReviewFingerprint: proof.fingerprint };
  const authority = { accountId: "calendar", accountVersion: 1, credentialId: "credential", writeGrantId: "write", writeGrantVersion: 1, memberId: "member", memberRole: "owner",
    memberUpdatedAt: "2026-09-10T02:00:00.000Z", workspaceUpdatedAt: "2026-09-10T02:00:00.000Z", accountScopes: [GOOGLE_CALENDAR_WRITE_SCOPE], grantScopes: [GOOGLE_CALENDAR_WRITE_SCOPE] };
  const gate = { status: "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED", committed: false, executionAuthorized: false, actor: { ...actor }, operationId: "operation",
    view: proof.view, fingerprint: proof.fingerprint, request, authority, inspectedAt: new Date(wall + dbOffset).toISOString(), approvalExpiresAt: new Date(wall + dbOffset + 360000).toISOString() };
  const discovery = { view: proof.view, approvalPresent: false, reviewCommitted: true, operationCommitted: true, approvalCommitted: null as boolean | null,
    binding: null as boolean | null, stateValid: null as boolean | null, status: "pending", phase: null as string | null, attempts: 0, leaseMatches: null as boolean | null,
    leaseIsNull: true, resultIsNull: true, externalTransportPerformed: false };
  const env: Record<string, string> = { ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED: "true", ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true",
    ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_EXTERNAL_OWNER_REF: "synthetic", ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic",
    GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const original = new AbortController(), replacement = new AbortController();
  const initialBudget = createCorrelatedCalendarApprovalClaimBudget({ deadlineAt: wall + 25000, signal: original.signal });
  const budget = { ...initialBudget, transactionOptions: { ...initialBudget.transactionOptions } };
  const events: string[] = [];
  let returnedLeaseExtra = 0, state: unknown;
  let onStage: (stage: string) => void = () => undefined;
  const advance = (ms: number) => { monotone += ms; vi.setSystemTime(Date.now() + ms); };
  const query = vi.fn(async (sql: string, ...args: unknown[]) => {
    const stage = sql.startsWith("SELECT current_setting") ? "isolation" : sql.startsWith("SELECT set_config") ? "timeouts" : sql.startsWith("SELECT sms_correlated_approval_view") ? "discovery"
      : sql.startsWith("SELECT o.id") ? "lock" : sql.startsWith("INSERT INTO") ? "insert" : "clock";
    events.push(stage); onStage(stage);
    if (stage === "isolation") return [{ isolation: "serializable" }];
    if (stage === "timeouts") return [];
    if (stage === "discovery") return [discovery];
    if (stage === "lock") return [{ id: "operation" }];
    if (stage === "insert") {
      expect(typeof args[9]).toBe("string");
      expect(sql).toContain("($10::timestamptz AT TIME ZONE 'UTC')");
      return [{ id: args[0], approvedAt: new Date(Date.now() + dbOffset), approvalExpiresAt: new Date(gate.approvalExpiresAt), leaseUntil: new Date(Date.parse(args[9] as string) + returnedLeaseExtra) }];
    }
    return [{ now: new Date(Date.now() + dbOffset) }];
  });
  const execute = vi.fn(async (_sql: string, ...args: unknown[]) => { events.push("cas"); state = JSON.parse(args[6] as string); onStage("cas"); return 1; });
  mocks.gate.mockImplementation(async () => { events.push("gate"); onStage("gate"); return gate; });
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute } as unknown as TemporalRegistryDB;
  return { run: () => claimCorrelatedCalendarApprovalInTransaction(tx, command, actor, env, budget), budget, original, replacement, query, execute, gate, discovery, env, events, advance,
    on: (hook: typeof onStage) => { onStage = hook; }, extraLease: (ms: number) => { returnedLeaseExtra = ms; }, get state() { return state; } };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(wall); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("C2b claim peer review — real helper, synthetic gate and SQL transport", () => {
  it.each([0, 3600000, -3600000])("INSERT latency cannot renew the fixed DB-clock lease with offset %s", async offset => {
    const h = fixture(offset); h.on(stage => { if (stage === "lock") h.advance(400); if (stage === "insert") h.advance(900); });
    const result = await h.run();
    expect(result.status).toBe("CLAIM_CREATED_NOT_COMMITTED");
    if (result.status !== "CLAIM_CREATED_NOT_COMMITTED") throw new Error("claim expected");
    expect(result.claim.leaseUntil).toBe(new Date(wall + offset + 24600).toISOString());
    expect(result.claim.approvedAt).toBe(new Date(wall + offset + 1300).toISOString());
    expect(inspectCorrelatedCalendarApprovalState(h.state, result.claim, result.view).state.phase).toBe("CLAIMED");
    expect(result).toMatchObject({ committed: false, executionAuthorized: false });
    expect(h.events).toEqual(["isolation", "timeouts", "discovery", "gate", "lock", "insert", "cas", "clock"]);
  });
  it("snapshots the original signal even when caller replaces mutable budget.signal during await", async () => {
    const h = fixture(); h.on(stage => { if (stage === "clock") { h.budget.signal = h.replacement.signal; h.original.abort(); } });
    await expect(h.run()).rejects.toThrow("CORRELATED_CALENDAR_APPROVAL_CLAIM_REFUSED");
    expect(h.events.at(-1)).toBe("clock"); expect(h.budget.signal).toBe(h.replacement.signal); expect(h.replacement.signal.aborted).toBe(false);
    expect(h.execute).toHaveBeenCalledTimes(1); // Rejection is inside caller TX; this mock does not prove rollback.
  });
  it("replacement signal abort cannot cancel the already captured original signal", async () => {
    const h = fixture(); h.on(stage => { if (stage === "isolation") { h.budget.signal = h.replacement.signal; h.replacement.abort(); } });
    expect(await h.run()).toMatchObject({ status: "CLAIM_CREATED_NOT_COMMITTED", committed: false }); expect(h.original.signal.aborted).toBe(false);
  });
  it("refuses a RETURNING lease one millisecond beyond the exact fixed SQL argument", async () => {
    const h = fixture(); h.extraLease(1);
    await expect(h.run()).rejects.toThrow("CORRELATED_CALENDAR_APPROVAL_CLAIM_REFUSED");
    expect(h.events).toContain("insert"); expect(h.execute).not.toHaveBeenCalled();
  });
  it("time spent before transaction callback remains spent despite wall-clock rollback", async () => {
    const h = fixture(); h.advance(5001); vi.setSystemTime(wall - 3600000);
    await expect(h.run()).rejects.toThrow("CORRELATED_CALENDAR_APPROVAL_CLAIM_REFUSED"); expect(h.query).not.toHaveBeenCalled();
  });
  it("an exact replay returns no claim and never invokes current gate or a write", async () => {
    const h = fixture(); Object.assign(h.discovery, { approvalPresent: true, approvalCommitted: true, binding: true, stateValid: true, status: "uncertain", phase: "UNCERTAIN", attempts: 1, resultIsNull: false });
    h.env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED = "false"; h.env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT = "2000-01-01T00:00:00Z";
    expect(await h.run()).toEqual({ status: "ALREADY_ATTEMPTED", committed: false, executionAuthorized: false });
    expect(mocks.gate).not.toHaveBeenCalled(); expect(h.execute).not.toHaveBeenCalled(); expect(h.events).toEqual(["isolation", "timeouts", "discovery"]);
  });
});
