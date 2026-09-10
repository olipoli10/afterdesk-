import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { createPersonalIntentInput, type PersonalIntentProposal } from "@/server/model-gateway/personal-intent/contract";
import { prepareStoredPersonalIntentReview } from "@/server/model-gateway/personal-intent/review-consumer";

const shared = vi.hoisted(() => ({ source: vi.fn(), model: vi.fn(), calendar: vi.fn(), outbound: vi.fn() }));
vi.mock("@/server/model-gateway/personal-subject", () => ({ inspectPersonalGatewaySubject: shared.source }));
vi.mock("@/server/model-gateway/personal-intent/admission", () => ({ inspectModelAuthority: shared.model }));
vi.mock("@/server/personal-assistant/calendar-actions", async load => ({ ...await load<object>(), preparePersonalCalendarInTransaction: shared.calendar }));
vi.mock("@/server/personal-assistant/outbox", () => ({ preparePersonalOutboundInTransaction: shared.outbound }));

const env = { NODE_ENV: "test" as const, ENDVERA_EXTERNAL_AUTHORITY_REF: "ENDVERA-PERSONAL-20260910-100CAD",
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", TWILIO_PHONE_NUMBER: "+15145550111" };
const fp = (text: string) => canonicalFingerprint(text);
function fixture(body = "Texte-moi : Bonjour", kind: "sms" | "call" | "calendar" | "read" = "sms") {
  const sourceInput = createPersonalIntentInput("source", body);
  const span = (quote: string) => ({ quote, start: body.indexOf(quote), end: body.indexOf(quote) + quote.length });
  const action = kind === "sms" || kind === "call" ? { id: "a", dependsOn: [], kind: kind === "sms" ? "PREPARE_SELF_SMS" : "PREPARE_SELF_CALL", message: span("Bonjour") }
    : kind === "read" ? { id: "a", dependsOn: [], kind: "READ_CALENDAR", period: span("demain") }
    : { id: "a", dependsOn: [], kind: "PREPARE_CALENDAR_EVENT", title: span("visite"), starts: span("demain à 14h"), ends: span("15h") };
  const proposal = { schemaVersion: 1, requestFingerprint: sourceInput.requestFingerprint, actions: [action] } as PersonalIntentProposal;
  const source = { actorUserId: "owner", input: sourceInput, subject: { kind: "personal_assistant_operation", operationId: "source", workspaceId: "workspace" },
    authorityFingerprint: fp("source-auth"), receivedAt: "2026-09-10T13:00:00Z", timezone: "America/Toronto" };
  const model = { accountId: "model-account", fingerprint: fp("model-auth") };
  const request = { schemaVersion: 1, sourceOperationId: "source", requestFingerprint: sourceInput.requestFingerprint,
    sourceAuthorityFingerprint: source.authorityFingerprint, modelAuthorityFingerprint: model.fingerprint, reviewedRateFingerprint: fp("rates"),
    gatewayOperationId: "gateway", policyHash: fp("policy"), routeHash: fp("route"), pilotEnvelopeFingerprint: fp("envelope"),
    budgetId: "budget", reservedCadMicros: "1", reservedUsdMicros: "1" };
  const stored = { schemaVersion: 1, status: "PROPOSAL_STORED_NOT_AUTHORIZED", executionAuthorized: false, readyForActionPreparation: false,
    accounting: "UNSETTLED", automaticRetry: false, transportMode: "SYNTHETIC_LOCAL", dispatchAttempted: true,
    outcomeKnowledge: "RESPONSE_RECEIVED_COST_UNSETTLED", proposal, temporal: [{ startsAtUtc: "2099-01-01T00:00:00Z" }] };
  const row = { request, requestHash: canonicalFingerprint(request), result: stored, resultEvidenceRef: canonicalFingerprint(stored),
    responseEvidenceRef: canonicalFingerprint(stored), gatewayId: "gateway", requestFingerprint: sourceInput.requestFingerprint,
    policyHash: request.policyHash, routeHash: request.routeHash, connectorAccountId: "model-account",
    sourceRequest: { from: "+15145550122", to: env.TWILIO_PHONE_NUMBER }, now: new Date("2026-09-10T14:00:00Z") };
  const query = vi.fn().mockImplementation(async (sql: string) => sql.includes("SELECT c.request") ? [row] : [{ id: "action-account", grantedScopes: ["https://www.googleapis.com/auth/calendar.events"] }]);
  const tx = { $queryRawUnsafe: query } as unknown as Prisma.TransactionClient;
  shared.source.mockResolvedValue(source); shared.model.mockResolvedValue(model);
  const input = { enabled: true, userId: "owner", workspaceId: "workspace", sourceOperationId: "source", modelChildOperationId: "child" };
  const reseal = () => { row.resultEvidenceRef = row.responseEvidenceRef = canonicalFingerprint(stored); };
  return { tx, query, input, row, stored, source, model, proposal, reseal, span };
}
beforeEach(() => {
  vi.clearAllMocks();
  shared.calendar.mockResolvedValue({ operationId: "calendar-draft", requestHash: "calendar-hash", status: "pending" });
  shared.outbound.mockResolvedValue({ operationId: "message-draft", requestHash: "message-hash", status: "pending" });
});

describe("stored personal candidate review consumer (local, mocked persistence)", () => {
  it("is OFF before DB access", async () => {
    const f = fixture(); expect(await prepareStoredPersonalIntentReview(f.tx, { ...f.input, enabled: undefined }, env)).toMatchObject({ status: "DISABLED" });
    expect(f.query).not.toHaveBeenCalled(); expect(shared.outbound).not.toHaveBeenCalled();
  });
  it("accepts only IDs from authenticated caller, not injected proposal/recipient/time", async () => {
    const f = fixture(); await expect(prepareStoredPersonalIntentReview(f.tx, { ...f.input, proposal: {} } as typeof f.input, env)).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  });
  it("prepares exact self SMS with caller transaction, full source and no authority", async () => {
    const f = fixture(); const result = await prepareStoredPersonalIntentReview(f.tx, f.input, env);
    expect(result).toMatchObject({ status: "REVIEW_PREPARED_NOT_AUTHORIZED", executionAuthorized: false, externalTransportPerformed: false,
      semanticIntentVerified: false, accounting: "UNSETTLED", source: { text: "Texte-moi : Bonjour" },
      actions: [{ status: "PREPARED_UNSENT", draft: { to: "+15145550122", from: env.TWILIO_PHONE_NUMBER, text: "Bonjour" } }] });
    expect(shared.outbound).toHaveBeenCalledWith(f.tx, expect.objectContaining({ kind: "sms_outbound", to: "+15145550122", text: "Bonjour" }), env);
    expect(Object.isFrozen(result)).toBe(true);
    const sql = f.query.mock.calls[0][0];
    for (const constraint of ["s.status='processing'", 's."leaseUntil">now()', "c.status='completed'", "ai.status='succeeded'", 'ai."resultId"=c.id', 'FOR UPDATE OF c,s']) expect(sql).toContain(constraint);
  });
  it("prepares exact self call with ENDVERA disclosure only", async () => {
    const f = fixture("Appelle-moi : Bonjour", "call");
    expect(await prepareStoredPersonalIntentReview(f.tx, f.input, env)).toMatchObject({ actions: [{ draft: { text: "Bonjour, ici l’assistant ENDVERA. Bonjour" } }] });
    expect(shared.outbound.mock.calls[0][1]).toMatchObject({ kind: "voice_outbound", text: "Bonjour" });
  });
  it.each(["Texte Marc : Bonjour", "Appelle Marc : Bonjour", "Ne texte-moi pas : Bonjour", "Si possible, texte-moi : Bonjour", "Texte-moi : Bonjour puis appelle Marc"])("does not redirect/guess %s", async body => {
    const f = fixture(body); expect(await prepareStoredPersonalIntentReview(f.tx, f.input, env)).toMatchObject({ actions: [{ status: "CLARIFY" }] });
    expect(shared.outbound).not.toHaveBeenCalled(); expect(shared.calendar).not.toHaveBeenCalled();
  });
  it("does not let a SELF enum trim the requested message", async () => {
    const f = fixture("Texte-moi : Bonjour à Marc");
    expect(await prepareStoredPersonalIntentReview(f.tx, f.input, env)).toMatchObject({ actions: [{ status: "CLARIFY" }] });
    expect(shared.outbound).not.toHaveBeenCalled();
  });
  it("recomputes calendar dates from authoritative source, ignoring stored temporal projection", async () => {
    const f = fixture("Ajoute visite demain à 14h à 15h", "calendar");
    expect(await prepareStoredPersonalIntentReview(f.tx, f.input, env)).toMatchObject({ actions: [{ status: "PREPARED_UNSENT", draft: {
      title: "visite", startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T19:00:00.000Z", timezone: "America/Toronto" } }] });
    expect(shared.calendar).toHaveBeenCalledWith(f.tx, expect.objectContaining({ userId: "owner", workspaceId: "workspace" }));
  });
  it("returns only a read review; no Google client/token operation", async () => {
    const f = fixture("Mon agenda demain", "read");
    expect(await prepareStoredPersonalIntentReview(f.tx, f.input, env)).toMatchObject({ actions: [{ status: "READ_REVIEW_ONLY" }] });
    expect(shared.calendar).not.toHaveBeenCalled(); expect(shared.outbound).not.toHaveBeenCalled();
  });
  it("clarifies missing current action grant", async () => {
    const f = fixture(); f.query.mockImplementation(async sql => sql.includes("SELECT c.request") ? [f.row] : []);
    expect(await prepareStoredPersonalIntentReview(f.tx, f.input, env)).toMatchObject({ actions: [{ status: "CLARIFY" }] });
    expect(shared.outbound).not.toHaveBeenCalled();
  });
  it("rejects bound result absence, including other tenant/actor/source/lifecycle", async () => {
    const f = fixture(); f.query.mockResolvedValue([]);
    await expect(prepareStoredPersonalIntentReview(f.tx, f.input, env)).rejects.toThrow("BOUND_RESULT_REQUIRED");
  });
  it.each(["actor", "source", "model", "request", "result", "response"])("refuses changed %s provenance", async field => {
    const f = fixture();
    if (field === "actor") f.source.actorUserId = "other";
    if (field === "source") f.source.authorityFingerprint = fp("changed");
    if (field === "model") f.model.fingerprint = fp("changed");
    if (field === "request") f.row.requestHash = fp("changed");
    if (field === "result") f.row.resultEvidenceRef = fp("changed");
    if (field === "response") f.row.responseEvidenceRef = fp("changed");
    await expect(prepareStoredPersonalIntentReview(f.tx, f.input, env)).rejects.toThrow(); expect(shared.outbound).not.toHaveBeenCalled();
  });
  it("still rejects malicious proposal fields even with a matching result hash", async () => {
    const f = fixture(); Object.assign(f.proposal, { execute: true }); f.reseal();
    await expect(prepareStoredPersonalIntentReview(f.tx, f.input, env)).rejects.toThrow(); expect(shared.outbound).not.toHaveBeenCalled();
  });
  it("clarifies dependencies and never treats a prior action as executed", async () => {
    const f = fixture("Mon agenda demain", "read");
    f.proposal.actions.unshift({ id: "c", kind: "CLARIFY", dependsOn: [], reason: "MISSING_CONTEXT" });
    f.proposal.actions[1].dependsOn = ["c"]; f.reseal();
    expect(await prepareStoredPersonalIntentReview(f.tx, f.input, env)).toMatchObject({ actions: [{ status: "CLARIFY" }, { status: "CLARIFY" }] });
    expect(shared.calendar).not.toHaveBeenCalled();
  });
  it("uses deterministic per-child/action idempotency, never fresh retry IDs", async () => {
    const f = fixture(); await prepareStoredPersonalIntentReview(f.tx, f.input, env); await prepareStoredPersonalIntentReview(f.tx, f.input, env);
    expect(shared.outbound.mock.calls[0][1].requestId).toEqual(shared.outbound.mock.calls[1][1].requestId);
    expect(shared.outbound.mock.calls[0][1].requestId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
  });
  it("rejects an already consumed draft instead of presenting it as unsent", async () => {
    const f = fixture(); shared.outbound.mockResolvedValue({ operationId: "already", requestHash: "hash", status: "completed" });
    await expect(prepareStoredPersonalIntentReview(f.tx, f.input, env)).rejects.toThrow("DRAFT_ALREADY_CONSUMED");
  });
  it("refuses expired pilot before preparing", async () => {
    const f = fixture(); f.row.now = new Date("2026-10-11T00:00:00Z");
    await expect(prepareStoredPersonalIntentReview(f.tx, f.input, env)).rejects.toThrow("PILOT_INACTIVE");
  });
});
