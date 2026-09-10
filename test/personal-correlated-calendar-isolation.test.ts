import { createHash } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ member: vi.fn(), account: vi.fn(), unique: vi.fn(), many: vi.fn(), create: vi.fn(),
  relatedUnique: vi.fn(), relatedMany: vi.fn(), update: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), tokens: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { constructionWorkspaceMember: { findFirst: m.member },
  constructionConnectorAccount: { findUniqueOrThrow: m.account },
  personalAssistantOperation: { findUnique: m.unique, findMany: m.many, create: m.create, updateMany: m.update },
  personalSmsCorrelatedCalendarReview: { findUnique: m.relatedUnique, findMany: m.relatedMany },
  $queryRawUnsafe: m.query, $executeRawUnsafe: m.execute, $transaction: m.transaction } }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ googleTokensForOwner: m.tokens }));
vi.mock("@/server/personal-assistant/api-auth", () => ({ personalApiUser: vi.fn(async () => ({ user: { id: "owner" } })) }));
import { prisma } from "@/lib/db";
import { preparePersonalCalendar, preparePersonalCalendarInTransaction, personalCalendarActions, claimPersonalCalendarWriteInTransaction, executeClaimedPersonalCalendarWrite } from "@/server/personal-assistant/calendar-actions";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import type { GoogleCalendarClient } from "@/server/personal-assistant/google-client";
import { personalModelReviewsForOwner } from "@/server/model-gateway/personal-intent/review-projection";
import { loadCalendarConfirmationBinding } from "@/server/personal-assistant/calendar-confirmation-authority";
import { selectPersonalAutomaticOutboundCandidates } from "@/server/personal-assistant/outbound-queue";
import { POST } from "@/app/api/endvera/v1/personal/google/actions/route";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const draft = { title: "Visite synthétique", startsAt: "2036-09-11T18:00:00.000Z", endsAt: "2036-09-11T19:00:00.000Z", timezone: "America/Toronto" };
const prepare = { userId: "owner", workspaceId: "workspace", requestId: "11111111-1111-4111-8111-111111111111", draft };
const request = { ...draft, accountVersion: 1, requestId: prepare.requestId };
const approval = { userId: "owner", workspaceId: "workspace", operationId: "calendar", expectedRequestHash: digest(request) };
const scopes = ["https://www.googleapis.com/auth/calendar.events"];
const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic", ENDVERA_EXTERNAL_OWNER_REF: "synthetic",
  ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic",
  GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example",
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2099-01-01T00:00:00Z" };
const origins = [
  { name: "marker only", correlatedTemporalReceiptId: "receipt", correlatedCalendarReview: null },
  { name: "relation only", correlatedTemporalReceiptId: null, correlatedCalendarReview: { id: "review" } },
  { name: "foreign relation", correlatedTemporalReceiptId: null, correlatedCalendarReview: { id: "foreign-review", userId: "other", workspaceId: "other" } },
  { name: "marker and relation", correlatedTemporalReceiptId: "receipt", correlatedCalendarReview: { id: "review" } },
];
function row(origin = { correlatedTemporalReceiptId: null as string | null, correlatedCalendarReview: null as object | null }) {
  return { id: "calendar", createdByUserId: "owner", workspaceId: "workspace", request, requestHash: digest(request),
    kind: "calendar_write", status: "pending", ...origin };
}
/** Checks the emitted query contract. Mock responses below are NOT SQL execution/lock proof. */
function expectGlobalSqlRefusal(sql: string, alias: "o" | "d") {
  expect(sql).toContain(`${alias}."correlatedTemporalReceiptId" IS NULL`);
  expect(sql).toContain(`NOT EXISTS (SELECT 1 FROM "PersonalSmsCorrelatedCalendarReview" correlated WHERE correlated."calendarOperationId"=${alias}.id)`);
  expect(sql).not.toMatch(/correlated\."(?:workspaceId|userId)"/u);
}
beforeEach(() => {
  vi.resetAllMocks();
  m.member.mockResolvedValue({ id: "member" });
  m.account.mockResolvedValue({ id: "google", stateVersion: 1, status: "connected", revokedAt: null, grantedScopes: scopes });
  m.unique.mockResolvedValue(null); m.many.mockResolvedValue([]); m.query.mockResolvedValue([]);
  m.relatedMany.mockResolvedValue([]);
  m.relatedUnique.mockImplementation(async () => (await m.unique.mock.results.at(-1)?.value)?.correlatedCalendarReview ?? null);
  m.execute.mockResolvedValue(1); m.create.mockImplementation(async ({ data }) => ({ id: "new", ...data }));
  m.transaction.mockImplementation(work => work(prisma));
});

describe("internal correlated origin stays transaction-only and never grants execution", () => {
  const origin = { kind: "personal_sms_temporal_receipt" as const, receiptId: "synthetic-receipt" };
  const internalInput = { ...prepare, requestId: personalCorrelatedCalendarRequestId(origin.receiptId) };
  const internalRequest = { ...draft, accountVersion: 1, requestId: internalInput.requestId };
  const internalHash = digest(internalRequest);
  const tx = () => ({ constructionWorkspaceMember: { findFirst: m.member }, constructionConnectorAccount: { findUniqueOrThrow: m.account },
    personalSmsCorrelatedCalendarReview: { findUnique: m.relatedUnique },
    personalAssistantOperation: { findUnique: m.unique, create: m.create }, $queryRawUnsafe: m.query } as unknown as Prisma.TransactionClient);
  const existing = () => ({ ...row(), connectorAccountId: "google", request: internalRequest, requestHash: internalHash,
    correlatedTemporalReceiptId: origin.receiptId, correlatedCalendarReview: { id: "review", receiptId: origin.receiptId,
      calendarOperationId: "calendar", workspaceId: "workspace", userId: "owner", calendarRequestHash: internalHash } });
  beforeEach(() => m.query.mockResolvedValue([{ isolation: "serializable" }]));
  it.each(["root", "undefined-property"])("rejects %s client before owner or DB access", async mode => {
    const db = mode === "root" ? prisma : { ...tx(), $transaction: undefined };
    await expect(preparePersonalCalendarInTransaction(db as Prisma.TransactionClient, internalInput, origin)).rejects.toThrow("CALENDAR_CORRELATED_TRANSACTION_REQUIRED");
    expect(m.member).not.toHaveBeenCalled(); expect(m.query).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
  it.each(["read committed", "repeatable read", "SERIALIZABLE", ""])("rejects isolation %s before owner or preparation", async isolation => {
    m.query.mockResolvedValue([{ isolation }]);
    await expect(preparePersonalCalendarInTransaction(tx(), internalInput, origin)).rejects.toThrow("CALENDAR_CORRELATED_SERIALIZABLE_REQUIRED");
    expect(m.query).toHaveBeenCalledWith("SELECT current_setting('transaction_isolation') AS isolation");
    expect(m.member).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
  it("requires the canonical receipt request UUID before DB access", async () => {
    await expect(preparePersonalCalendarInTransaction(tx(), prepare, origin)).rejects.toThrow("CALENDAR_CORRELATED_REQUEST_ID_REQUIRED");
    expect(m.query).not.toHaveBeenCalled(); expect(m.member).not.toHaveBeenCalled();
  });
  it("creates only a pending operation with marker at INSERT and unchanged six-field request/hash", async () => {
    const result = await preparePersonalCalendarInTransaction(tx(), internalInput, origin);
    expect(result).toMatchObject({ status: "pending", requestHash: internalHash });
    expect(m.create.mock.calls[0][0].data).toMatchObject({ kind: "calendar_write", status: "pending", correlatedTemporalReceiptId: origin.receiptId,
      request: internalRequest, requestHash: internalHash });
    expect(m.create.mock.calls[0][0].data.request).not.toHaveProperty("correlatedTemporalReceiptId");
    expect(m.update).not.toHaveBeenCalled(); expect(m.tokens).not.toHaveBeenCalled();
  });
  it("copies supplied origin and input before isolation await", async () => {
    const supplied = structuredClone(internalInput), suppliedOrigin = { ...origin };
    m.query.mockImplementation(async () => { suppliedOrigin.receiptId = "changed"; supplied.userId = "other"; supplied.draft.title = "changed";
      return [{ isolation: "serializable" }]; });
    await preparePersonalCalendarInTransaction(tx(), supplied, suppliedOrigin);
    expect(m.create.mock.calls[0][0].data).toMatchObject({ createdByUserId: "owner", correlatedTemporalReceiptId: origin.receiptId, request: internalRequest });
  });
  it("returns exact linked replay with actual terminal status, never resets or creates another draft", async () => {
    m.unique.mockResolvedValue({ ...existing(), status: "uncertain" });
    expect(await preparePersonalCalendarInTransaction(tx(), internalInput, origin)).toEqual({ operationId: "calendar", requestHash: internalHash, status: "uncertain" });
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.tokens).not.toHaveBeenCalled();
  });
  it.each(["receiptId", "calendarOperationId", "workspaceId", "userId", "calendarRequestHash"] as const)("refuses changed relation %s", async key => {
    const stored = existing(); stored.correlatedCalendarReview[key] = "changed"; m.unique.mockResolvedValue(stored);
    await expect(preparePersonalCalendarInTransaction(tx(), internalInput, origin)).rejects.toThrow("CALENDAR_CORRELATED_REPLAY_CONFLICT");
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it.each(["ordinary", "missing relation", "wrong marker", "changed body", "other account"])("refuses adoption of %s replay", async mode => {
    const stored: Record<string, unknown> = existing();
    if (mode === "ordinary") { stored.correlatedTemporalReceiptId = null; stored.correlatedCalendarReview = null; }
    if (mode === "missing relation") stored.correlatedCalendarReview = null;
    if (mode === "wrong marker") stored.correlatedTemporalReceiptId = "another";
    if (mode === "changed body") stored.request = { ...internalRequest, title: "changed" };
    if (mode === "other account") stored.connectorAccountId = "other";
    m.unique.mockResolvedValue(stored);
    await expect(preparePersonalCalendarInTransaction(tx(), internalInput, origin)).rejects.toThrow("CALENDAR_CORRELATED_REPLAY_CONFLICT");
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it("public wrapper never forwards an origin smuggled in its input", async () => {
    m.unique.mockResolvedValue(existing());
    await expect(preparePersonalCalendar({ ...internalInput, origin } as typeof internalInput)).rejects.toThrow("CALENDAR_CORRELATED_REVIEW_UNAVAILABLE");
    expect(m.query).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
});

describe("future correlated calendar generic isolation — synthetic local only", () => {
  it.each(origins)("refuses exact UUID/hash PREPARE replay: $name", async origin => {
    m.unique.mockResolvedValue(row(origin));
    await expect(preparePersonalCalendar(prepare)).rejects.toThrow("CALENDAR_CORRELATED_REVIEW_UNAVAILABLE");
    expect(m.unique).toHaveBeenCalledWith({ where: { idempotencyKey: `personal-calendar:workspace:${prepare.requestId}` } });
    expect(m.relatedUnique).toHaveBeenCalledWith({ where: { calendarOperationId: "calendar" },
      select: { id: true, receiptId: true, calendarOperationId: true, workspaceId: true, userId: true, calendarRequestHash: true } });
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.tokens).not.toHaveBeenCalled();
  });
  it("does not treat absent origin projection as proven legacy NULL", async () => {
    const { correlatedTemporalReceiptId: _marker, correlatedCalendarReview: _relation, ...incomplete } = row(); void _marker; void _relation;
    m.unique.mockResolvedValue(incomplete);
    await expect(preparePersonalCalendar(prepare)).rejects.toThrow("CALENDAR_CORRELATED_REVIEW_UNAVAILABLE");
  });
  it("preserves ordinary matching replay and ordinary pending creation with unchanged request/hash", async () => {
    m.unique.mockResolvedValue(row());
    expect(await preparePersonalCalendar(prepare)).toEqual({ operationId: "calendar", requestHash: digest(request), status: "pending" });
    expect(m.create).not.toHaveBeenCalled(); m.unique.mockResolvedValue(null);
    const created = await preparePersonalCalendar(prepare);
    expect(created).toMatchObject({ operationId: m.create.mock.calls[0][0].data.id, requestHash: digest(request), status: "pending" });
    expect(m.create.mock.calls[0][0].data).toMatchObject({ request, requestHash: digest(request), kind: "calendar_write" });
    expect(m.create.mock.calls[0][0].data).not.toHaveProperty("correlatedTemporalReceiptId");
  });
  it("filters marker and GLOBAL scalar relation in SQL before LIMIT30", async () => {
    m.query.mockResolvedValue([row()]);
    expect(await personalCalendarActions("owner", "workspace")).toMatchObject({ operations: [{ id: "calendar", draft }] });
    const [sql, workspace, owner] = m.query.mock.calls[0]; expectGlobalSqlRefusal(sql, "o");
    expect([workspace, owner]).toEqual(["workspace", "owner"]);
    expect(sql.indexOf('correlated."calendarOperationId"=o.id')).toBeLessThan(sql.indexOf("LIMIT 30"));
    expect(m.many).not.toHaveBeenCalled();
  });
  it("refuses a foreign GLOBAL relation even when the composite reverse relation would be null", async () => {
    m.unique.mockResolvedValue(row()); m.relatedUnique.mockResolvedValue({ id: "foreign", workspaceId: "other", userId: "other" });
    await expect(preparePersonalCalendar(prepare)).rejects.toThrow("CALENDAR_CORRELATED_REVIEW_UNAVAILABLE");
    expect(m.relatedUnique.mock.calls[0][0].where).toEqual({ calendarOperationId: "calendar" });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("refuses a rejected locked claim without state or token work", async () => {
    m.query.mockImplementation(async sql => { expectGlobalSqlRefusal(sql, "o"); return []; });
    await expect(claimPersonalCalendarWriteInTransaction(prisma as unknown as Prisma.TransactionClient, approval, env)).rejects.toThrow("CALENDAR_APPROVAL_REFUSED_OR_ALREADY_USED");
    expect(m.update).not.toHaveBeenCalled(); expect(m.tokens).not.toHaveBeenCalled();
  });
  it("rechecks durable origin before accepting a syntactically valid forged internal executor claim", async () => {
    const client = { insertEvent: vi.fn(), transportAttempts: 0 };
    const claim = { ...approval, request, authority: { accountId: "google", accountVersion: 1, credentialId: "credential",
      writeGrantId: "write", writeGrantVersion: 1, memberId: "member", memberRole: "owner" as const,
      memberUpdatedAt: "2026-09-10T00:00:00.000Z", workspaceUpdatedAt: "2026-09-10T00:00:00.000Z", accountScopes: scopes, grantScopes: scopes },
    approvalToken: "22222222-2222-4222-8222-222222222222", leaseUntil: new Date(Date.now() + 20_000) };
    m.query.mockImplementation(async sql => { expectGlobalSqlRefusal(sql, "o"); return []; });
    await expect(executeClaimedPersonalCalendarWrite(claim, env, client as unknown as GoogleCalendarClient)).rejects.toThrow("CALENDAR_WRITE_OUTCOME_UNKNOWN");
    expect(m.query).toHaveBeenCalledOnce(); expect(m.update).not.toHaveBeenCalled(); expect(m.tokens).not.toHaveBeenCalled();
    expect(client.insertEvent).not.toHaveBeenCalled();
  });
  it("preserves historical one-source review but removes actionable IDs when the filtered draft is absent", async () => {
    const wire = { accountSid: "ACsynthetic", messageSid: "SMsynthetic", from: "+15005550001", to: "+15005550006", body: "Ajoute Visite demain." };
    const review = { status: "REVIEW_PREPARED_NOT_AUTHORIZED", executionAuthorized: false, externalTransportPerformed: false, accounting: "UNSETTLED",
      automaticRetry: false, semanticIntentVerified: false, modelChildOperationId: "child",
      source: { operationId: "source", text: wire.body, receivedAt: "2026-09-10T14:00:00.000Z", timezone: "America/Toronto" },
      actions: [{ actionId: "event", kind: "PREPARE_CALENDAR_EVENT", status: "PREPARED_UNSENT", operationId: "calendar", requestHash: digest(request), draft }] };
    m.query.mockImplementation(async sql => sql.includes("SELECT w.id") ? [{ id: "workspace" }] : [{ id: "source", request: wire, requestHash: digest(wire),
      result: { personalModelReview: review }, createdAt: new Date(review.source.receivedAt), modelChildOperationId: "child" }]);
    m.many.mockResolvedValue([]);
    m.relatedMany.mockResolvedValue([{ calendarOperationId: "calendar" }]);
    const result = await personalModelReviewsForOwner("owner", "workspace");
    expect(m.relatedMany).toHaveBeenCalledWith({ where: { calendarOperationId: { in: ["calendar"] } }, select: { calendarOperationId: true } });
    expect(m.many).not.toHaveBeenCalled();
    expect(result.reviews[0].source.text).toBe(wire.body);
    expect(result.reviews[0].actions[0]).toMatchObject({ currentStatus: "UNAVAILABLE_OR_CHANGED", nextDecision: "MANUAL_REVIEW", draft });
    expect(result.reviews[0].actions[0]).not.toHaveProperty("operationId"); expect(result.reviews[0].actions[0]).not.toHaveProperty("requestHash");
    m.relatedMany.mockResolvedValue([]);
    await personalModelReviewsForOwner("owner", "workspace");
    expect(m.many).toHaveBeenCalledWith({ where: { id: { in: ["calendar"] }, workspaceId: "workspace", createdByUserId: "owner",
      OR: [{ kind: "calendar_write", correlatedTemporalReceiptId: null }, { kind: { in: ["sms_outbound", "voice_outbound"] } }] },
    select: { id: true, kind: true, status: true, request: true, requestHash: true } });
  });
  it("puts global refusal in the shared SMS binding before summary, bridge or consumption can proceed", async () => {
    m.query.mockImplementation(async sql => { expectGlobalSqlRefusal(sql, "d"); return []; });
    await expect(loadCalendarConfirmationBinding(prisma as unknown as Prisma.TransactionClient, { userId: "owner", workspaceId: "workspace" },
      { sourceOperationId: "source", modelChildOperationId: "child", calendarOperationId: "calendar", reviewActionId: "event" }, {})).rejects.toThrow("CONFIRMATION_CURRENT_BINDING_REQUIRED");
    expect(m.execute).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.tokens).not.toHaveBeenCalled();
  });
  it("puts the confirmation-origin exclusion before final outbound LIMIT without mutating retained work", async () => {
    const flags = { ...env, ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: "synthetic", TWILIO_API_KEY_SID: "synthetic",
      TWILIO_API_KEY_SECRET: "synthetic", TWILIO_AUTH_TOKEN: "synthetic", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
      ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true",
      ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED: "true" };
    m.query.mockImplementation(async sql => {
      expectGlobalSqlRefusal(sql, "d");
      expect(sql.indexOf('d."correlatedTemporalReceiptId" IS NULL')).toBeLessThan(sql.indexOf('ORDER BY o."createdAt",o.id LIMIT $1'));
      expect(sql).not.toMatch(/UPDATE |INSERT |DELETE /u); return [];
    });
    expect(await selectPersonalAutomaticOutboundCandidates({ enabled: true, includeConfirmations: true }, flags)).toMatchObject({ status: "CANDIDATES_NOT_AUTHORIZED", candidates: [] });
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it("actual ordinary PREPARE route refuses known marked UUID/hash rather than returning it", async () => {
    m.unique.mockResolvedValue(row(origins[0]));
    const response = await POST(new Request("https://endvera.example/api/endvera/v1/personal/google/actions", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "PREPARE", workspaceId: "workspace", requestId: prepare.requestId, draft }) }));
    expect(response.status).toBe(409); expect(m.create).not.toHaveBeenCalled(); expect(m.tokens).not.toHaveBeenCalled();
  });
  it("ordinary PREPARE cannot supply an internal origin field", async () => {
    const response = await POST(new Request("https://endvera.example/api/endvera/v1/personal/google/actions", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "PREPARE", workspaceId: "workspace", requestId: prepare.requestId, draft, correlatedTemporalReceiptId: "receipt" }) }));
    expect(response.status).toBe(400); expect(m.unique).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
});
