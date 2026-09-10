import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), release: vi.fn(), transaction: vi.fn(), audit: vi.fn() }));
const route = vi.hoisted(() => ({ id: "synthetic-route", adapterKey: "voice-synthetic-direct", canonicalHash: "synthetic-route-hash", billingProvider: "synthetic", intermediary: null }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction, $queryRawUnsafe: mocks.query } }));
vi.mock("@/server/model-gateway/evidence", async original => ({
  ...await original<typeof import("@/server/model-gateway/evidence")>(), appendGatewayAuditEvent: mocks.audit,
}));
vi.mock("@/server/model-gateway/operations", async original => ({
  ...await original<typeof import("@/server/model-gateway/operations")>(), loadGatewayPolicySnapshot: async () => ({}), loadGatewayRouteSnapshots: async () => [],
}));
vi.mock("@/server/model-gateway/policy", async original => ({
  ...await original<typeof import("@/server/model-gateway/policy")>(), resolveGatewayPolicy: () => ({ disposition: "route_authorized", policy: {}, route }),
}));
vi.mock("@/server/model-gateway/breakers", async original => ({
  ...await original<typeof import("@/server/model-gateway/breakers")>(), loadGatewayBreakerResolution: async () => ({ status: "clear", generation: 1 }),
}));
import { dispatchVoiceGatewayAttempt } from "@/server/model-gateway/voice/dispatch";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue([{ subjectKind: "project_brain_voice", clientId: null }]);
  mocks.execute.mockResolvedValue(1); mocks.release.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async callback => callback({ $queryRawUnsafe: mocks.query, $executeRawUnsafe: mocks.execute,
    accountProviderSpendHold: { updateMany: mocks.release } }));
});
describe("independent PB admission confinement at the legacy dispatcher", () => {
  it.each(["prepared_synthetic_not_dispatched", "authorized"])("a forged legacy subject label cannot release a persisted PB hold on rollout refusal (%s)", async status => {
    // Identifiers stand for an existing PB admission. Its cloned request label
    // is untrusted; only persisted subject inspection can decide cleanup scope.
    const admission = {
      status, executionAuthorized: false, actorId: "synthetic-owner",
      claim: { operationId: "pb-ai", operationKey: "voice-intake:pb", lockedBy: "pb-owner-token", attempt: 1 },
      request: { subject: { kind: "voice_intake_segment", sessionId: "pb-session", segmentId: "pb-segment" },
        requestFingerprint: "sha256:synthetic-request", outputContractHash: "sha256:synthetic-contract" },
      operation: { id: "pb-gateway" }, decision: { id: "pb-decision" },
      attempt: { id: "pb-attempt", accountSpendHoldId: "pb-hold", requestEvidenceRef: "sha256:synthetic-evidence" },
      policy: { id: "synthetic-policy", canonicalHash: "sha256:synthetic-policy" }, route,
    };
    const adapter = { key: "voice-synthetic-direct", dispatch: vi.fn() };
    await dispatchVoiceGatewayAttempt({ admission: admission as never, actor: { id: "synthetic-owner", role: "CLIENT" },
      adapter: adapter as never, abortSignal: new AbortController().signal });
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(adapter.dispatch).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('v."subjectKind"=\'voice_intake\''),
      "pb-ai", "pb-owner-token", "voice-intake:pb", "synthetic-owner", "pb-session", "pb-segment",
      "pb-gateway", "pb-decision", "pb-attempt", "pb-hold", 1, "sha256:synthetic-request", "synthetic-policy",
      route.canonicalHash, "sha256:synthetic-policy", "sha256:synthetic-evidence", "synthetic", "sha256:synthetic-contract");
  });
  it("an unrelated owned CLIENT session cannot be substituted for the PB operation on positive dispatch", async () => {
    const legacy = { clientId: "synthetic-owner", sessionStatus: "transcribing", segmentStatus: "registered",
      expiresAt: new Date("2099-01-01T00:00:00Z"), consentVersion: "synthetic-consent", audioFingerprint: "sha256:synthetic" };
    mocks.query.mockImplementation(async (sql: string) => sql.includes('FROM "AiOperation"')
      ? [{ id: "pb-ai", subjectKind: "project_brain_voice", clientId: null, voiceIntakeSegmentId: "pb-segment" }] : [legacy]);
    const admission = { status: "authorized", actorId: "synthetic-owner",
      claim: { operationId: "pb-ai", operationKey: "voice-intake:pb", lockedBy: "pb-owner-token", attempt: 1 },
      request: { subject: { kind: "voice_intake_segment", sessionId: "unrelated-client-session", segmentId: "unrelated-client-segment" },
        requestFingerprint: "sha256:synthetic-request", outputContractHash: "sha256:synthetic" },
      projection: { audioFingerprint: "sha256:synthetic", ordinal: 0 },
      policy: { id: "synthetic-policy", canonicalHash: "sha256:synthetic-policy" }, route,
      operation: { id: "pb-gateway" }, decision: { id: "pb-decision", breakerGeneration: 1 },
      attempt: { id: "pb-attempt", accountSpendHoldId: "pb-hold", requestEvidenceRef: "sha256:synthetic" } };
    const adapter = { key: "voice-synthetic-direct", dispatch: vi.fn().mockResolvedValue({ dispatchKnowledge: "dispatched_unknown",
      providerRequestRef: null, errorClass: "unknown_dispatched_outcome", httpStatus: null }) };
    await dispatchVoiceGatewayAttempt({ admission: admission as never, actor: { id: "synthetic-owner", role: "CLIENT" }, adapter: adapter as never,
      rollout: { environment: "local", voiceEnabled: true }, abortSignal: new AbortController().signal });
    expect(adapter.dispatch).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE OF t'),
      "pb-ai", "pb-owner-token", "voice-intake:pb", "synthetic-owner", "unrelated-client-session", "unrelated-client-segment",
      "pb-gateway", "pb-decision", "pb-attempt", "pb-hold", 1, "sha256:synthetic-request", "synthetic-policy",
      route.canonicalHash, "sha256:synthetic-policy", "sha256:synthetic", "synthetic", "sha256:synthetic");
  });
});
