import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
const m = vi.hoisted(() => ({ query: vi.fn(), configuration: vi.fn(), admit: vi.fn(), dispatch: vi.fn(), adapter: vi.fn(), transport: vi.fn(), credential: vi.fn(), review: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRawUnsafe: m.query } }));
vi.mock("@/server/model-gateway/personal-intent/configuration", () => ({ loadPersonalModelConfiguration: m.configuration }));
vi.mock("@/server/model-gateway/personal-intent/admission", () => ({ admitPersonalIntent: m.admit }));
vi.mock("@/server/model-gateway/personal-intent/dispatch", () => ({ dispatchPersonalIntent: m.dispatch }));
vi.mock("@/server/model-gateway/personal-intent/openrouter-adapter", () => ({ createOpenRouterPersonalIntentAdapter: m.adapter }));
vi.mock("@/server/model-gateway/personal-intent/openrouter-transport", () => ({ createPersonalOpenRouterTransport: m.transport }));
vi.mock("@/server/personal-assistant/model-connection", () => ({ personalModelCredentialForDispatch: m.credential }));
vi.mock("@/server/model-gateway/personal-intent/review-consumer", () => ({ prepareStoredPersonalIntentReview: m.review }));
import { PERSONAL_INTENT_PROVIDER_TIMEOUT_MS, processPersonalModelSms, personalModelReviewReply } from "@/server/personal-assistant/model-worker";

const configuration = { status: "CONFIGURED_NOT_AUTHORIZED", configurationFingerprint: "synthetic-reviewed", policyVersionId: "policy", rateConfiguration: {}, pilotEnvelopeReview: {} };
const admission = { status: "ADMITTED_NOT_DISPATCHED", source: { actorUserId: "owner", input: {} }, modelAuthority: {}, childOperationId: "child",
  budgetPolicy: { model: "synthetic/model", providerEndpoint: "synthetic", maxOutputTokens: 512 } };
const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "true" };
const review = { status: "REVIEW_PREPARED_NOT_AUTHORIZED" as const, executionAuthorized: false as const, externalTransportPerformed: false as const,
  accounting: "UNSETTLED" as const, automaticRetry: false as const, semanticIntentVerified: false as const, modelChildOperationId: "child",
  source: { operationId: "source", text: "demain", receivedAt: "2026-09-10T04:00:00Z", timezone: "America/Toronto" },
  actions: [{ actionId: "read", kind: "READ_CALENDAR", status: "READ_REVIEW_ONLY" as const }] };
function context() { return { signal: new AbortController().signal, deadlineAt: Date.now() + 48_000,
  claim: Object.freeze({ operationId: "source", workspaceId: "workspace", userId: "owner", attempt: 1 as const, leaseUntil: new Date(Date.now() + 48_000).toISOString() }) }; }
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T04:00:00Z"));
  m.configuration.mockReturnValue(configuration); m.query.mockResolvedValue([{ id: "source" }]); m.admit.mockResolvedValue(admission);
  m.transport.mockReturnValue(vi.fn()); m.adapter.mockReturnValue({}); m.dispatch.mockResolvedValue({ status: "PROPOSAL_STORED_NOT_AUTHORIZED" });
  m.credential.mockResolvedValue("synthetic-only-not-real"); m.review.mockResolvedValue(review);
});
afterEach(() => vi.useRealTimers());
describe("exclusive personal SMS candidate orchestration", () => {
  it("does not admit or access a key without external wiring/configuration", async () => {
    expect((await processPersonalModelSms(context(), {})).reply).toContain("pas encore activée");
    m.configuration.mockReturnValue({ status: "REFUSED" }); await processPersonalModelSms(context(), env);
    expect(m.admit).not.toHaveBeenCalled(); expect(m.transport).not.toHaveBeenCalled(); expect(m.credential).not.toHaveBeenCalled();
  });
  it("requires the exact live source fence before admission", async () => {
    m.query.mockResolvedValue([]);
    await expect(processPersonalModelSms(context(), env)).rejects.toThrow("SOURCE_CLAIM_LOST");
    expect(m.admit).not.toHaveBeenCalled(); expect(m.query.mock.calls[0][0]).toContain('"leaseUntil">(clock_timestamp() AT TIME ZONE \'UTC\')');
    expect(m.query.mock.calls[0][0]).toContain('"leaseUntil"=($5::timestamptz AT TIME ZONE \'UTC\')');
  });
  it("rejects expired/aborted source before admission", async () => {
    const ctx = context(); ctx.deadlineAt = Date.now();
    await expect(processPersonalModelSms(ctx, env)).rejects.toThrow("SOURCE_DEADLINE");
    expect(m.query).not.toHaveBeenCalled(); expect(m.admit).not.toHaveBeenCalled();
  });
  it("does not access credentials during construction and only prepares review inside caller transaction", async () => {
    const result = await processPersonalModelSms(context(), env);
    expect(m.credential).not.toHaveBeenCalled(); expect(m.review).not.toHaveBeenCalled();
    expect(m.dispatch.mock.calls[0][0].transportMode).toBe("EXTERNAL_PROVIDER");
    expect(PERSONAL_INTENT_PROVIDER_TIMEOUT_MS).toBe(40_000);
    expect(m.adapter.mock.calls[0][0].timeoutMs).toBe(PERSONAL_INTENT_PROVIDER_TIMEOUT_MS);
    const tx = {} as Prisma.TransactionClient;
    expect(await result.finalizeReview!(tx)).toBe(review);
    expect(m.review.mock.calls[0][0]).toBe(tx);
    expect(m.review.mock.calls[0][1]).toMatchObject({ userId: "owner", workspaceId: "workspace", sourceOperationId: "source", modelChildOperationId: "child" });
  });
  it("accepts a valid provider result after the former 25 second cutoff", async () => {
    m.dispatch.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 30_000));
      return { status: "PROPOSAL_STORED_NOT_AUTHORIZED" };
    });
    const pending = processPersonalModelSms(context(), env);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;
    expect(result.finalizeReview).toBeTypeOf("function");
    expect(m.adapter.mock.calls[0][0].timeoutMs).toBe(PERSONAL_INTENT_PROVIDER_TIMEOUT_MS);
  });
  it("lazy credential rechecks source ownership before and after loading", async () => {
    await processPersonalModelSms(context(), env);
    const getApiKey = m.transport.mock.calls[0][0].getApiKey;
    m.credential.mockImplementation(async () => { m.query.mockResolvedValue([]); return "synthetic-only-not-real"; });
    await expect(getApiKey()).rejects.toThrow("SOURCE_CLAIM_LOST"); expect(m.credential).toHaveBeenCalledTimes(1);
  });
  it("cannot finalize after configuration changes or deadline expires", async () => {
    const ctx = context(); const result = await processPersonalModelSms(ctx, env);
    m.configuration.mockReturnValue({ ...configuration, configurationFingerprint: "changed" });
    await expect(result.finalizeReview!({} as Prisma.TransactionClient)).rejects.toThrow("CONFIGURATION_CHANGED");
    m.configuration.mockReturnValue(configuration); vi.setSystemTime(ctx.deadlineAt);
    await expect(result.finalizeReview!({} as Prisma.TransactionClient)).rejects.toThrow("SOURCE_DEADLINE");
    expect(m.review).not.toHaveBeenCalled();
  });
  it.each(["UNCERTAIN", "NOT_DISPATCHED"])("returns an honest failure notice for %s without preparing actions or retrying", async status => {
    m.dispatch.mockResolvedValue({ status });
    const result = await processPersonalModelSms(context(), env);
    expect(result.reply).toContain("Je n’ai pas pu interpréter");
    expect(result.reply).toContain("Aucun changement de calendrier");
    expect(result.finalizeReview).toBeUndefined();
    expect(m.dispatch).toHaveBeenCalledTimes(1);
    expect(m.review).not.toHaveBeenCalled();
  });
  it("does not return even a failure notice after losing the claim", async () => {
    m.dispatch.mockResolvedValue({ status: "CLAIM_LOST" });
    await expect(processPersonalModelSms(context(), env)).rejects.toThrow("SOURCE_CLAIM_LOST");
    expect(m.review).not.toHaveBeenCalled();
  });
  it("rechecks the live source after an uncertain provider result", async () => {
    m.dispatch.mockImplementation(async () => { m.query.mockResolvedValue([]); return { status: "UNCERTAIN" }; });
    await expect(processPersonalModelSms(context(), env)).rejects.toThrow("SOURCE_CLAIM_LOST");
    expect(m.review).not.toHaveBeenCalled();
  });
  it("never describes READ_REVIEW_ONLY as a fetched agenda", () => {
    const reply = personalModelReviewReply(review);
    expect(reply).toContain("Google Agenda n’a pas été consulté"); expect(reply).toContain("Aucun rendez-vous modifié");
  });
});
