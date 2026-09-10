import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ gate: vi.fn(), transaction: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-gate", () => ({ inspectCorrelatedCalendarApprovalOfferInTransaction: m.gate }));
import { readCorrelatedCalendarApprovalOffer as read, correlatedCalendarApprovalOfferSchema } from "@/server/personal-assistant/correlated-calendar-approval-offer";
import { correlatedCalendarOfferFixture } from "./fixtures/correlated-calendar-offer.fixture";
let f: ReturnType<typeof correlatedCalendarOfferFixture>;
const context = () => ({ deadlineAt: Date.now() + 5000 });
const run = () => read(f.input, f.env, context());
const reject = () => expect(run()).rejects.toThrow("CORRELATED_CALENDAR_APPROVAL_OFFER_UNAVAILABLE");
beforeEach(() => {
  vi.resetAllMocks(); f = correlatedCalendarOfferFixture(); vi.spyOn(Date, "now").mockReturnValue(Date.parse(f.now)); vi.spyOn(performance, "now").mockReturnValue(1000);
  m.gate.mockImplementation(async () => f.gate); m.query.mockImplementation(async () => [{ now: new Date(f.now) }]);
  m.transaction.mockImplementation(work => work({ $queryRawUnsafe: m.query }));
});
afterEach(() => vi.restoreAllMocks());
describe("individual exact offer, single canonical gate", () => {
  it.each([undefined, false, "true"])("input %s stays OFF without DB", async enabled => {
    expect(await read({ ...f.input, enabled } as Parameters<typeof read>[0], f.env, context())).toHaveProperty("status", "DISABLED"); expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each(["ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED", "ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED"])("OFF %s precedes gate", async key => {
    f.env[key] = "false"; expect(await run()).toHaveProperty("status", "DISABLED"); expect(m.gate).not.toHaveBeenCalled();
  });
  it("emits exact V1 evidence and fingerprint without private calendar handle or authority", async () => {
    const result = await run(); expect(result).toEqual(f.dto); expect(Object.isFrozen(result)).toBe(true);
    expect(correlatedCalendarApprovalOfferSchema.parse(result)).toEqual(result);
    expect(JSON.stringify(result)).not.toMatch(/private-calendar-operation|private-credential|private-grant|approvalToken|readPrerequisite/);
    expect(result).not.toHaveProperty("operationId"); expect(JSON.stringify(result)).toContain("source-a");
    expect(m.gate).toHaveBeenCalledOnce(); expect(m.transaction).toHaveBeenCalledOnce(); expect(m.query).toHaveBeenCalledExactlyOnceWith("SELECT clock_timestamp() AS now");
    expect(m.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 500, timeout: 4500 });
  });
  it.each(["READ_MISSING", "ALREADY_ATTEMPTED", "TERMINAL", "OWNER_REVOKED"])("gate refuses %s without fake empty/fallback reason", async reason => { m.gate.mockRejectedValue(new Error(reason)); await reject(); expect(m.gate).toHaveBeenCalledOnce(); });
  it.each(["committed", "executionAuthorized", "persistencePerformed", "providerCallPerformed"])("refuses flag %s", async key => { Object.assign(f.gate, { [key]: true }); await reject(); });
  it.each(["claim", "expectedPhase"])("refuses a processing gate handle %s", async key => { Object.assign(f.gate, { [key]: null }); await reject(); });
  it("refuses DISABLED gate despite flags remaining enabled", async () => { m.gate.mockResolvedValue({ status: "DISABLED" }); await reject(); });
  it.each(["userId", "workspaceId"])("refuses actor %s substitution", async key => { Object.assign(f.gate.actor, { [key]: "other" }); await reject(); });
  it.each(["fingerprint", "inspectedAt", "approvalExpiresAt"])("refuses gate pin %s", async key => { Object.assign(f.gate, { [key]: "wrong" }); await reject(); });
  it.each(["reviewId", "currentStatus", "preparationExpiresAt"])("refuses review mismatch %s", async key => { Object.assign(f.gate.review, { [key]: "wrong" }); await reject(); });
  it.each(["title", "startsAt", "endsAt", "timezone", "accountVersion", "requestId"])("refuses request field %s changed", async key => { Object.assign(f.gate.request, { [key]: key === "accountVersion" ? 2 : "other" }); await reject(); });
  it("refuses view scope/fingerprint mismatch even if gate actor matches", async () => { f.gate.view.scope.userId = "other"; await reject(); });
  it("refuses an extra executable property in V1 instead of stripping it", async () => { Object.assign(f.gate.review, { calendarOperationId: "private" }); await reject(); });
  it("copies exact display text before final clock latency", async () => {
    const original = structuredClone(f.dto); m.query.mockImplementation(async () => { f.gate.review.evidence.sources[0].text = "mutated"; f.gate.fingerprint = "f".repeat(64); return [{ now: new Date(f.now) }]; });
    expect(await run()).toEqual(original);
  });
  it("copies actor, reviewId, signal and deadline before gate latency", async () => {
    const c = { ...context(), signal: new AbortController().signal }, originalSignal = c.signal;
    m.gate.mockImplementation(async (_tx, arg, _env, supplied) => { expect(arg.reviewId).toBe("review"); expect(supplied.signal).toBe(originalSignal); f.input.actor.userId = "other"; f.input.reviewId = "other"; c.deadlineAt = 0; c.signal = new AbortController().signal; return f.gate; });
    expect(await read(f.input, f.env, c)).toEqual(f.dto);
  });
  it("rejects expired DB clock and backwards DB clock", async () => {
    m.query.mockResolvedValue([{ now: new Date(f.expiry) }]); await reject(); m.query.mockResolvedValue([{ now: new Date(Date.parse(f.now) - 1) }]); await reject();
  });
  it("commit latency consumes original TTL even with a frozen host wall clock", async () => {
    f.gate.approvalExpiresAt = f.gate.review.preparationExpiresAt = new Date(Date.parse(f.now) + 100).toISOString();
    m.transaction.mockImplementation(async work => { const out = await work({ $queryRawUnsafe: m.query }); vi.mocked(performance.now).mockReturnValue(1100); return out; }); await reject();
  });
  it("clock query latency is included by sampling before its await", async () => {
    f.gate.approvalExpiresAt = f.gate.review.preparationExpiresAt = new Date(Date.parse(f.now) + 100).toISOString();
    m.query.mockImplementation(async () => { vi.mocked(performance.now).mockReturnValue(1100); return [{ now: new Date(f.now) }]; }); await reject();
  });
  it("does not renew inspectedAt or expiry after commit", async () => {
    m.transaction.mockImplementation(async work => { const out = await work({ $queryRawUnsafe: m.query }); vi.mocked(performance.now).mockReturnValue(1100); return out; }); expect(await run()).toEqual(f.dto);
  });
  it.each(["gate", "clock", "commit"])("abort during %s prevents disclosure", async stage => {
    const ac = new AbortController();
    if (stage === "gate") m.gate.mockImplementation(async () => { ac.abort(); return f.gate; });
    if (stage === "clock") m.query.mockImplementation(async () => { ac.abort(); return [{ now: new Date(f.now) }]; });
    if (stage === "commit") m.transaction.mockImplementation(async work => { const out = await work({ $queryRawUnsafe: m.query }); ac.abort(); return out; });
    await expect(read(f.input, f.env, { ...context(), signal: ac.signal })).rejects.toThrow("OFFER_UNAVAILABLE");
  });
  it.each(["ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED", "ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED", "ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED", "ENDVERA_GOOGLE_OAUTH_ENABLED"])("switch %s withdrawn at commit refuses", async key => {
    m.transaction.mockImplementation(async work => { const out = await work({ $queryRawUnsafe: m.query }); f.env[key] = "false"; return out; }); await reject();
  });
  it("unknown commit never publishes the provisional offer", async () => { m.transaction.mockImplementation(async work => { await work({ $queryRawUnsafe: m.query }); throw new Error("SQL private"); }); await reject(); });
  it("expired/preaborted deadline does not invoke gate", async () => {
    await expect(read(f.input, f.env, { deadlineAt: Date.now() })).rejects.toThrow("OFFER_UNAVAILABLE"); const ac = new AbortController(); ac.abort();
    await expect(read(f.input, f.env, { ...context(), signal: ac.signal })).rejects.toThrow("OFFER_UNAVAILABLE"); expect(m.gate).not.toHaveBeenCalled();
  });
  it("contains no second selection, claim, execution or new namespace", () => {
    const source = readFileSync("src/server/personal-assistant/correlated-calendar-approval-offer.ts", "utf8");
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b|SELECT .*Personal|pg_advisory|executeClaimed|googleTokensForOwner|\.fetch\(/);
    expect(source.match(/await inspectCorrelatedCalendarApprovalOfferInTransaction/g)).toHaveLength(1);
  });
});
