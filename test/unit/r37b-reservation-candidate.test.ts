import { beforeEach, describe, expect, it, vi } from "vitest";
import { reserveProviderSpend } from "@/server/construction-operating-assistant-r37b/activation";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), member: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/construction-assistant-v1/workspace", () => ({ requireActiveConstructionMember: mocks.member, ConstructionAccessDenied: class extends Error {} }));
vi.mock("@/server/construction-assistant-v1/audit", () => ({ appendConstructionAudit: mocks.audit }));

describe("R37B candidate-bound spend, real service with in-memory DB", () => {
  beforeEach(() => vi.resetAllMocks());
  function setup() {
    const input = { actorId: "owner", workspaceId: "synthetic", grantId: "grant", candidateKey: "OPENROUTER_CONTROLLER", idempotencyKey: "attempt", caseFingerprint: `sha256:${"a".repeat(64)}`, exactModelId: "same/model", sealedExecutorFingerprint: `sha256:${"b".repeat(64)}`, requestedMicros: 10n };
    const now = new Date("2026-09-02T12:00:00Z");
    const grant = { id: input.grantId, candidateKey: input.candidateKey, status: "ACTIVE", expiresAt: new Date("2026-09-02T13:00:00Z"), sealedExecutorFingerprint: input.sealedExecutorFingerprint, exactModelId: input.exactModelId, allowedCaseFingerprints: [input.caseFingerprint], attemptCount: 0, maxCallCount: 3, reservedSpendMicros: 0n, settledSpendMicros: 0n, maxTotalSpendMicros: 100n };
    let attempt: Record<string, unknown> | null = null;
    const tx = { $queryRaw: vi.fn(), providerActivationGrant: { findFirst: vi.fn(async () => grant), update: vi.fn() }, providerLaneControl: { findUnique: vi.fn(async () => ({ state: "ENABLED" })) }, providerSpendAttempt: { findUnique: vi.fn(async () => attempt), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { attempt = { ...data, id: "attempt", state: "RESERVED", version: 1, settledMicros: 0n, releasedMicros: 0n }; return attempt; }) } };
    mocks.member.mockResolvedValue({ role: "owner" });
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
    return { input, grant, tx, clock: { now: () => new Date(now) } };
  }
  it("refuses wrong candidate before any spend or grant mutation", async () => {
    const f = setup(); f.grant.candidateKey = "PERPLEXITY_SEARCH";
    await expect(reserveProviderSpend(f.input, f.clock)).rejects.toThrow("R37B_CANDIDATE_MISMATCH");
    expect(f.tx.providerSpendAttempt.create).not.toHaveBeenCalled();
    expect(f.tx.providerActivationGrant.update).not.toHaveBeenCalled();
  });
  it("requires candidate explicitly rather than guessing it from the grant", async () => {
    const f = setup();
    const { candidateKey: ignored, ...legacy } = f.input; void ignored;
    await expect(reserveProviderSpend(legacy, f.clock)).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("replays exact reservation once, and refuses a changed candidate fingerprint", async () => {
    const f = setup();
    expect(await reserveProviderSpend(f.input, f.clock)).toMatchObject({ replayed: false });
    expect(await reserveProviderSpend(f.input, f.clock)).toMatchObject({ replayed: true });
    expect(f.tx.providerSpendAttempt.create).toHaveBeenCalledTimes(1);
    f.grant.candidateKey = "PERPLEXITY_SEARCH";
    await expect(reserveProviderSpend({ ...f.input, candidateKey: "PERPLEXITY_SEARCH" }, f.clock)).rejects.toThrow("R37B_RESERVATION_IDEMPOTENCY_CONFLICT");
    expect(f.tx.providerSpendAttempt.create).toHaveBeenCalledTimes(1);
    expect(f.tx.providerActivationGrant.update).toHaveBeenCalledTimes(1);
  });
});
