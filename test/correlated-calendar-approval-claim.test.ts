import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ gate: vi.fn(), unexpected: vi.fn() }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-gate", () => ({ inspectCorrelatedCalendarApprovalOfferInTransaction: m.gate }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.unexpected } }));
import { createCorrelatedCalendarApprovalClaimBudget as budgetFor, claimCorrelatedCalendarApprovalInTransaction as claim } from "@/server/personal-assistant/correlated-calendar-approval";
import { fingerprintCorrelatedCalendarApprovalView, inspectCorrelatedCalendarApprovalClaim, inspectCorrelatedCalendarApprovalState,
  type CorrelatedCalendarApprovalCommand } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { GOOGLE_CALENDAR_WRITE_SCOPE as WRITE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import type { TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";

const now = "2026-09-11T04:02:00.000Z", expiry = "2026-09-11T04:08:00.000Z";
function fixture() {
  const actor = { userId: "owner", workspaceId: "workspace" };
  const request = { title: "Inspection 🛠️", startsAt: "2026-09-12T18:00:00.000Z", endsAt: "2026-09-12T19:00:00.000Z", timezone: "America/Toronto", accountVersion: 1,
    requestId: personalCorrelatedCalendarRequestId("receipt") };
  const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const inspected = fingerprintCorrelatedCalendarApprovalView({ version: "personal-correlated-calendar-approval-view-v1", scope: actor,
    review: { reviewId: "review", receiptId: "receipt", reviewVersion: "personal-sms-correlated-calendar-review-v1", packetHash: "a".repeat(64), proofHash: "b".repeat(64) },
    request: { calendarRequestId: request.requestId, calendarRequestHash: requestHash, connectorAccountId: "calendar", accountVersion: 1 },
    presentation: { itemVersion: "personal-correlated-calendar-review-v1", evidenceVersion: "personal-correlated-calendar-local-preview-v1", titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } });
  const command: CorrelatedCalendarApprovalCommand = { version: "personal-correlated-calendar-approval-command-v1", workspaceId: "workspace", reviewId: "review",
    expectedRequestHash: requestHash, expectedReviewFingerprint: inspected.fingerprint };
  const authority = { accountId: "calendar", accountVersion: 1, credentialId: "credential", writeGrantId: "write", writeGrantVersion: 1, memberId: "member", memberRole: "owner",
    memberUpdatedAt: "2026-09-10T02:00:00.000Z", workspaceUpdatedAt: "2026-09-10T02:00:00.000Z", accountScopes: [WRITE], grantScopes: [WRITE] };
  const gate = { status: "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED", committed: false, executionAuthorized: false, actor: { ...actor }, operationId: "operation",
    view: inspected.view, fingerprint: inspected.fingerprint, request, authority, inspectedAt: now, approvalExpiresAt: expiry };
  const discovery = { view: inspected.view, approvalPresent: false, reviewCommitted: true, operationCommitted: true, approvalCommitted: null as boolean | null,
    binding: null as boolean | null, stateValid: null as boolean | null, status: "pending", phase: null as string | null, attempts: 0,
    leaseMatches: null as boolean | null, leaseIsNull: true, resultIsNull: true, externalTransportPerformed: false };
  const env: Record<string, string> = { ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED: "true", ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true",
    ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_EXTERNAL_OWNER_REF: "synthetic", ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic",
    GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const order: string[] = [], state = { discoveries: [discovery] as unknown[], locked: [{ id: "operation" }] as unknown[], inserted: null as unknown[] | null,
    approvedAt: new Date(Date.parse(now) + 10), leaseUntil: new Date(Date.parse(now) + 20000), finalNow: new Date(Date.parse(now) + 20), changed: 1,
    isolation: "serializable", writeCount: 0, result: null as unknown, approvalCount: 0, dbLeaseFromSql: false, hook: async (_stage: string) => { void _stage; } };
  const query = vi.fn(async (sql: string, ...args: unknown[]) => {
    const stage = sql.startsWith("SELECT current_setting") ? "isolation" : sql.startsWith("SELECT set_config") ? "timeouts"
      : sql.startsWith("SELECT sms_correlated_approval_view") ? "discovery" : sql.startsWith("SELECT o.id") ? "lock"
      : sql.startsWith("INSERT INTO") ? "insert" : "clock";
    order.push(stage); await state.hook(stage);
    if (stage === "isolation") return [{ isolation: state.isolation }];
    if (stage === "timeouts") return [];
    if (stage === "discovery") { expect(args).toEqual(["review", "workspace", "owner"]); expect(sql).not.toMatch(/FOR (SHARE|UPDATE)/); return state.discoveries; }
    if (stage === "lock") { expect(sql).toContain("FOR UPDATE OF o"); expect(args.slice(0, 5)).toEqual(["operation", "workspace", "owner", "calendar", command.expectedRequestHash]); return state.locked; }
    if (stage === "insert") { state.approvalCount++; expect(order.indexOf("lock")).toBeLessThan(order.indexOf("insert"));
      if (state.dbLeaseFromSql) { state.approvedAt = new Date(Date.now()); state.leaseUntil = typeof args[9] === "string" ? new Date(args[9]) : new Date(Date.now() + Number(args[9])); }
      return state.inserted ?? [{ id: args[0], approvedAt: state.approvedAt, approvalExpiresAt: new Date(expiry), leaseUntil: state.leaseUntil }]; }
    return [{ now: state.finalNow }];
  });
  const execute = vi.fn(async (sql: string, ...args: unknown[]) => { order.push("cas"); await state.hook("cas"); expect(sql).toMatch(/^UPDATE "PersonalAssistantOperation" SET status='processing'/);
    if (state.changed === 1) { state.writeCount++; state.result = JSON.parse(args[6] as string); } return state.changed; });
  m.gate.mockImplementation(async (_tx, _input, _env, context) => { order.push("gate"); expect(context.deadlineAt).toBeLessThanOrEqual(budget.claimDeadlineAt); await state.hook("gate"); return gate; });
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute } as unknown as TemporalRegistryDB;
  let budget = budgetFor({ deadlineAt: Date.now() + 25000 });
  const run = () => claim(tx, command, actor, env, budget);
  const runRollbackHarness = async () => { const before = { writeCount: state.writeCount, result: state.result, approvalCount: state.approvalCount };
    try { return await run(); } catch (error) { Object.assign(state, before); throw error; } };
  const replay = (phase = "CLAIMED", status = "processing") => Object.assign(discovery, { approvalPresent: true, approvalCommitted: true, binding: true,
    stateValid: true, status, phase, attempts: 1, leaseMatches: status === "processing", leaseIsNull: status !== "processing", resultIsNull: false,
    externalTransportPerformed: status === "completed" });
  return { run, runRollbackHarness, replay, actor, command, gate, authority, discovery, state, env, order, query, execute, tx,
    get budget() { return budget; }, setBudget: (value: typeof budget) => { budget = value; } };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
afterEach(() => { expect(m.unexpected).not.toHaveBeenCalled(); vi.useRealTimers(); });

describe("C2b transaction-only claim — simulated transactions, real A contract", () => {
  it("upgrades operation before INSERT and creates exact DB-timed A state with no commit/execute claim", async () => {
    const h = fixture(), result = await h.run();
    expect(h.order).toEqual(["isolation", "timeouts", "discovery", "gate", "lock", "insert", "cas", "clock"]);
    expect(result).toMatchObject({ status: "CLAIM_CREATED_NOT_COMMITTED", committed: false, executionAuthorized: false });
    if (result.status !== "CLAIM_CREATED_NOT_COMMITTED") throw new Error("new claim required");
    expect(result.claim.approvedAt).toBe(h.state.approvedAt.toISOString()); expect(result.claim.leaseUntil).toBe(h.state.leaseUntil.toISOString());
    expect(inspectCorrelatedCalendarApprovalClaim(result.claim, result.view).claim).toEqual(result.claim);
    expect(inspectCorrelatedCalendarApprovalState(h.state.result, result.claim, result.view).state.phase).toBe("CLAIMED");
    expect(Object.isFrozen(result.claim.authority.accountScopes)).toBe(true); expect(h.state.approvalCount).toBe(1); expect(h.state.writeCount).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/readGrant|synthetic|accessToken|refreshToken/);
  });
  it("phase timeout includes maxWait and total deadline is never renewed", () => { const b = budgetFor({ deadlineAt: Date.now() + 99000 });
    expect(b.deadlineAt - b.startedAt).toBe(25000); expect(b.claimDeadlineAt - b.startedAt).toBe(5000);
    expect(b.transactionOptions).toEqual({ isolationLevel: "Serializable", maxWait: 500, timeout: 4500 });
    const short = budgetFor({ deadlineAt: Date.now() + 100 }); expect(short.transactionOptions.maxWait + short.transactionOptions.timeout).toBe(100); expect(short.deadlineAt - short.startedAt).toBe(100);
  });
  it.each([NaN, Infinity, 0, Date.parse(now) + 1])("refuses invalid/insufficient budget %s", deadlineAt => { expect(() => budgetFor({ deadlineAt })).toThrow(); });
  it("pre-abort refuses budget creation", () => { const c = new AbortController(); c.abort(); expect(() => budgetFor({ deadlineAt: Date.now() + 5000, signal: c.signal })).toThrow(); });
  it("claim phase starts before lock queue, not at callback entry", async () => { const h = fixture(); vi.setSystemTime(Date.now() + 5001); await expect(h.run()).rejects.toThrow(); expect(h.query).not.toHaveBeenCalled(); });
  it("monotone elapsed cap survives wall-clock rollback", async () => { let tick = 1000; const spy = vi.spyOn(performance, "now").mockImplementation(() => tick);
    try { const h = fixture(); h.state.hook = async stage => { if (stage === "discovery") { tick += 5001; vi.setSystemTime(Date.now() - 3600000); } };
      await expect(h.run()).rejects.toThrow(); expect(m.gate).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
  it.each(["false", "TRUE", "1"])("OFF %s does not parse inputs or query", async flag => { const h = fixture(); h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED = flag;
    expect(await claim(h.tx, null as unknown as CorrelatedCalendarApprovalCommand, h.actor, h.env, h.budget)).toHaveProperty("status", "DISABLED"); expect(h.query).not.toHaveBeenCalled(); });
  it("rejects mismatched actor before any query", async () => { const h = fixture(); h.actor.workspaceId = "foreign"; await expect(h.run()).rejects.toThrow(); expect(h.query).not.toHaveBeenCalled(); });
  it("rejects root transaction client and wrong isolation", async () => { const h = fixture(); await expect(claim({ ...h.tx, $transaction: m.unexpected } as unknown as TemporalRegistryDB, h.command, h.actor, h.env, h.budget)).rejects.toThrow();
    expect(h.query).not.toHaveBeenCalled(); h.state.isolation = "read committed"; await expect(h.run()).rejects.toThrow(); expect(h.order).toEqual(["isolation"]); });
  it.each(["expectedRequestHash", "expectedReviewFingerprint"])("wrong command %s refuses before gate", async key => { const h = fixture(); Object.assign(h.command, { [key]: "f".repeat(64) }); await expect(h.run()).rejects.toThrow(); expect(m.gate).not.toHaveBeenCalled(); });
  it("foreign view owner refuses even with a matching client fingerprint", async () => { const h = fixture(); const view = structuredClone(h.discovery.view); view.scope.userId = "other";
    const foreign = fingerprintCorrelatedCalendarApprovalView(view); h.discovery.view = foreign.view; h.command.expectedReviewFingerprint = foreign.fingerprint;
    await expect(h.run()).rejects.toThrow(); expect(m.gate).not.toHaveBeenCalled(); });
  it.each(["CLAIMED", "DISPATCH_CLAIMED", "CONFIRMED", "UNCERTAIN"])("exact prior %s returns no handles, claim or new effect", async phase => { const h = fixture(); h.replay(phase, phase === "CONFIRMED" ? "completed" : phase === "UNCERTAIN" ? "uncertain" : "processing");
    expect(await h.run()).toEqual({ status: "ALREADY_ATTEMPTED", committed: false, executionAuthorized: false }); expect(m.gate).not.toHaveBeenCalled(); expect(h.execute).not.toHaveBeenCalled(); expect(h.state.approvalCount).toBe(0); });
  it("replay does not demand fresh Google/model/pilot/store or load C3 within transaction", async () => { const h = fixture(); h.replay();
    h.env.ENDVERA_GOOGLE_OAUTH_ENABLED = "OFF"; h.env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT = "2000-01-01T00:00:00Z"; h.env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED = "false";
    expect(await h.run()).toHaveProperty("status", "ALREADY_ATTEMPTED"); expect(h.order).toEqual(["isolation", "timeouts", "discovery"]); });
  it.each(["binding", "stateValid", "approvalCommitted", "reviewCommitted", "operationCommitted"])("replay refuses false %s", async key => { const h = fixture(); h.replay(); Object.assign(h.discovery, { [key]: false }); await expect(h.run()).rejects.toThrow(); });
  it.each(["attempts", "leaseMatches", "phase", "externalTransportPerformed"])("replay processing refuses invalid %s", async key => { const h = fixture(); h.replay(); Object.assign(h.discovery, { [key]: key === "attempts" ? 0 : key === "phase" ? "UNKNOWN" : key === "leaseMatches" ? false : true }); await expect(h.run()).rejects.toThrow(); });
  it("duplicate global approvals and missing discovery are refused", async () => { const h = fixture(); h.state.discoveries = []; await expect(h.run()).rejects.toThrow(); h.state.discoveries = [h.discovery, h.discovery]; await expect(h.run()).rejects.toThrow(); });
  it.each(["attempts", "resultIsNull", "leaseIsNull", "externalTransportPerformed"])("unclaimed non-pristine %s is not adopted", async key => { const h = fixture(); Object.assign(h.discovery, { [key]: key === "attempts" ? 1 : key === "externalTransportPerformed" }); await expect(h.run()).rejects.toThrow(); expect(m.gate).not.toHaveBeenCalled(); });
  it("gate refusal/disabled never inserts", async () => { const h = fixture(); m.gate.mockResolvedValue({ status: "DISABLED" }); await expect(h.run()).rejects.toThrow(); expect(h.order).not.toContain("insert"); });
  it("gate current fingerprint drift is refused", async () => { const h = fixture(); h.gate.fingerprint = "c".repeat(64); await expect(h.run()).rejects.toThrow(); expect(h.order).not.toContain("insert"); });
  it.each([{ rows: [] }, { rows: [{ id: "other" }] }, { rows: [{ id: "operation" }, { id: "operation" }] }])("missing/wrong/duplicate UPDATE lock refuses insertion: $rows", async ({ rows }) => {
    const h = fixture(); h.state.locked = rows; await expect(h.run()).rejects.toThrow("CORRELATED_CALENDAR_APPROVAL_CLAIM_REFUSED");
    expect(h.order).toContain("lock"); expect(h.order).not.toContain("insert"); });
  it.each([0, -1, 2, NaN])("CAS %s throws inside caller transaction; simulated rollback preserves absence", async count => { const h = fixture(); h.state.changed = count;
    await expect(h.runRollbackHarness()).rejects.toThrow(); expect(h.state.approvalCount).toBe(0); expect(h.state.writeCount).toBe(0); expect(h.state.result).toBe(null); });
  it.each(["gate", "lock", "insert", "cas", "clock"])("OFF after %s await refuses/rolls back without replaying", async stage => { const h = fixture(); h.state.hook = async current => { if (current === stage) h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED = "false"; };
    await expect(h.runRollbackHarness()).rejects.toThrow(); expect(h.state.writeCount).toBe(0); expect(h.state.approvalCount).toBe(0); });
  it.each(["ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_PERSONAL_PILOT_EXPIRES_AT"])("late changed %s refuses final claim", async key => { const h = fixture(); h.state.hook = async stage => { if (stage === "clock") h.env[key] = key.endsWith("EXPIRES_AT") ? "2026-10-11T01:18:26Z" : "other"; };
    await expect(h.runRollbackHarness()).rejects.toThrow(); expect(h.state.approvalCount).toBe(0); });
  it("preserves caller cancellation despite input budget signal replacement", async () => { const h = fixture(), c = new AbortController(); h.setBudget(budgetFor({ deadlineAt: Date.now() + 25000, signal: c.signal }));
    h.state.hook = async stage => { if (stage === "clock") c.abort(); }; await expect(h.runRollbackHarness()).rejects.toThrow(); });
  it("copies actor, command and gate nested values before later awaits", async () => { const h = fixture(); h.state.hook = async stage => {
    if (stage === "gate") { h.actor.userId = "mutated"; h.command.reviewId = "mutated"; }
    if (stage === "lock") { h.gate.request.title = "changed"; h.gate.authority.credentialId = "changed"; }
  }; const result = await h.run(); if (result.status !== "CLAIM_CREATED_NOT_COMMITTED") throw new Error("new claim required");
    expect(result.claim.userId).toBe("owner"); expect(result.claim.origin.reviewId).toBe("review"); expect(result.claim.authority.credentialId).toBe("credential"); expect(result.claim.request.title).toBe("Inspection 🛠️"); });
  it("uses remaining original 25s duration for DB lease, not a fresh 25s", async () => { const h = fixture(); h.state.hook = async stage => { if (stage === "lock") vi.setSystemTime(Date.now() + 1000); };
    await h.run(); const call = h.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO"))!; expect(Date.parse(call[10] as string)).toBeLessThanOrEqual(Date.parse(now) + 24000); });
  it("INSERT latency cannot move the durable lease past the original DB-clock ceiling", async () => {
    const h = fixture(); h.state.dbLeaseFromSql = true;
    h.state.hook = async stage => { if (stage === "insert") { vi.setSystemTime(Date.now() + 1000); h.state.finalNow = new Date(Date.now() + 20); } };
    const result = await h.run(); if (result.status !== "CLAIM_CREATED_NOT_COMMITTED") throw new Error("new claim required");
    expect(Date.parse(result.claim.leaseUntil)).toBeLessThanOrEqual(Date.parse(now) + 25000);
    expect(result.claim.approvedAt).toBe("2026-09-11T04:02:01.000Z");
  });
  it.each(["2026-09-11T04:01:59.000Z", "2026-09-11T04:02:20.000Z", expiry])("final DB clock %s cannot certify invalid time", async value => { const h = fixture(); h.state.finalNow = new Date(value); await expect(h.runRollbackHarness()).rejects.toThrow(); });
  it("unknown driver error is propagated, never relabeled a known rollback/commit", async () => { const h = fixture(), failure = new Error("SYNTHETIC_COMMIT_OR_CONNECTION_UNKNOWN");
    h.state.hook = async stage => { if (stage === "insert") throw failure; }; await expect(h.run()).rejects.toBe(failure); expect(h.order.filter(x => x === "insert")).toHaveLength(1); expect(h.execute).not.toHaveBeenCalled(); });
  it("transaction acknowledgement belongs to caller; losing it cannot expose an executed result", async () => { const h = fixture(); let provisional: Awaited<ReturnType<typeof h.run>> | undefined;
    const caller = async () => { provisional = await h.run(); throw new Error("SYNTHETIC_COMMIT_ACK_LOST"); };
    await expect(caller()).rejects.toThrow("ACK_LOST"); expect(provisional).toMatchObject({ status: "CLAIM_CREATED_NOT_COMMITTED", committed: false, executionAuthorized: false }); });
  it("SQL explicitly locks before insert, UTC parameters, global provenance and no execution/history caller", () => { const s = readFileSync("src/server/personal-assistant/correlated-calendar-approval.ts", "utf8");
    expect(s.indexOf("FOR UPDATE OF o")).toBeLessThan(s.indexOf('INSERT INTO "PersonalSmsCorrelatedCalendarApproval"'));
    expect(s).toContain("maxWait, timeout: phase - maxWait"); expect(s).toContain("performance.now()"); expect(s).toContain("sms_correlated_approval_binding(a,r,o)");
    expect(s).toContain('a."reviewId"=r.id OR a."calendarOperationId"=o.id'); expect(s).toContain("($6::timestamptz AT TIME ZONE 'UTC')");
    const claimOnly = s.slice(s.indexOf("export async function claimCorrelatedCalendarApprovalInTransaction"), s.indexOf("const responseCommon"));
    expect(claimOnly).toContain("CLAIM_CREATED_NOT_COMMITTED"); expect(claimOnly).toContain('INSERT INTO "PersonalSmsCorrelatedCalendarApproval"'); expect(claimOnly.length).toBeGreaterThan(1000);
    expect(claimOnly).not.toMatch(/executeClaimed|readCorrelatedCalendarApprovalResult|googleTokensForOwner|insertEvent\(|\bfetch\(|\$transaction\(/);
  });
});
