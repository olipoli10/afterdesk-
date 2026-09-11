import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { preparePersonalModelOperatorArtifact } from "../src/server/model-gateway/personal-intent/operator-preparation";
import { inspectPersonalModelSetupManifest } from "../src/server/model-gateway/personal-intent/operator-setup";
import { sha256Canonical } from "../src/lib/construction-assistant-v1/canonical";
import { PERSONAL_MODEL_INGRESS_LIMITS, PERSONAL_MODEL_INGRESS_TARGET,
  inspectPersonalModelIngressConfiguration as inspect, assertPersonalModelIngressWindow as windowGuard,
  buildPersonalModelSetupClaim as claim, inspectPersonalModelSetupClaim as readClaim,
  buildPersonalModelSetupApplied as applied, inspectPersonalModelSetupApplied as readApplied,
} from "../src/server/model-gateway/personal-intent/operator-ingress-contract";
vi.mock("@/lib/db", () => ({ prisma: {} }));
afterEach(() => vi.restoreAllMocks());
const refused = "PERSONAL_MODEL_INGRESS_CONTRACT_REFUSED";
const now = "2026-09-11T01:00:00.000Z";
const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// Synthetic documents, no authentic provider review, secret, DB or runtime call.
function fixture() {
  const authority = "ENDVERA-PERSONAL-20260910-100CAD";
  const doc = { reviewRef: "synthetic-only", contentHash: `sha256:${"a".repeat(64)}` };
  const rate = { authorityId: authority, model: "synthetic/model", providerEndpoint: "synthetic-endpoint", reviewedAt: now,
    totalContextTokens: 32768, maxOutputTokens: 512, inputUsdMicrosPerMillionTokens: 1000000,
    outputUsdMicrosPerMillionTokens: 2000000, additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1500000,
    headroomBasisPoints: 1000, ceilingCadMicros: 20000000, perCallCeilingCadMicros: 100000 };
  const artifact = preparePersonalModelOperatorArtifact({ enabled: true, configuration: {
    operatorReview: { reviewerRef: "synthetic-reviewer", reviewedAt: now, rates: doc, fxAndFees: doc, privacy: doc, totalEnvelope: doc },
    pilotContext: { authorityId: authority, expiresAt: "2026-10-10T01:18:26Z" }, rateConfiguration: rate,
    pilotEnvelopeReview: { authorityId: authority, reviewRef: "synthetic", reviewedAt: now, nonModelExposureCeilingCadMicros: 80000000, totalCeilingCadMicros: 100000000 },
    privacyEvidence: { adapterKey: "openrouter-personal-intent-candidate", allowedDataClasses: ["personal_data"], billingProvider: "openrouter",
      certificationOwner: "synthetic-not-certified", effectiveAt: now, expiresAt: "2026-09-13T01:00:00Z",
      endpointKey: rate.providerEndpoint, intermediary: "openrouter", modelKey: rate.model, operationTypes: ["personal_intent_candidate_v1"],
      pathKind: "gateway_mediated", privacyPosture: "zero_retention", residency: ["synthetic-region"], tenancyMode: "route_isolated" },
    route: { id: "synthetic-route", version: 1, residency: ["synthetic-region"], maxInputTokens: 32768 },
    policy: { id: "synthetic-policy", version: 1 },
  } }, new Date(now));
  if (artifact.status !== "PREPARED_NOT_PUBLISHED") throw new Error("SYNTHETIC_FIXTURE_INVALID");
  const manifest = { version: "personal-model-operator-setup-v1", setupId: "12345678-1234-4234-8234-123456789abc",
    expectedHead: "a".repeat(40), expectedSchemaCatalogSha256: "b".repeat(64), authorityId: authority,
    pilotExpiresAt: "2026-10-10T01:18:26Z", workspaceId: "synthetic-workspace", ownerUserId: "synthetic-owner", artifact };
  const manifestUtf8 = JSON.stringify(manifest);
  const configuration = { version: "personal-model-operator-ingress-configuration-v1", mode: "ENABLED", setupRef: manifest.setupId,
    notBefore: now, expiresAt: "2026-09-11T01:15:00.000Z", manifestUtf8, manifestSha256: hash(manifestUtf8),
    expectedSourceHead: manifest.expectedHead, expectedSchemaCatalogSha256: manifest.expectedSchemaCatalogSha256,
    controllerReceiptRef: "synthetic-controller-receipt", targetProfile: "PERSONAL_PILOT" };
  return { manifest, configuration, utf8: JSON.stringify(configuration) };
}

describe("pure closed operator ingress configuration", () => {
  it("uses the real artifact and manifest producers but grants no execution authority", () => {
    const f = fixture(), result = inspect(f.utf8);
    expect(result.status).toBe("VALIDATED_NOT_AUTHORIZED");
    expect(result.manifestHash).toBe(inspectPersonalModelSetupManifest(f.manifest).manifestHash);
    expect(result.artifactHash).toBe(f.manifest.artifact.artifactHash);
    expect(result.configurationSha256).toBe(hash(f.utf8));
    expect(result.executionAuthorized).toBe(false); expect(result.controllerEvidenceVerified).toBe(false);
    expect(Object.isFrozen(result.manifest.artifact.configuration)).toBe(true);
    expect(PERSONAL_MODEL_INGRESS_TARGET).toMatchObject({ profile: "PERSONAL_PILOT", endpointId: "ep-purple-union-axj3h2t5",
      branchId: "br-nameless-moon-ax8nmuwj", database: "neondb", role: "neondb_owner" });
    expect(Object.isFrozen(PERSONAL_MODEL_INGRESS_TARGET)).toBe(true);
  });
  it("distinguishes original LF/CRLF/key-order bytes from canonical manifest meaning", () => {
    const f = fixture(), base = inspect(f.utf8);
    for (const manifestUtf8 of [f.configuration.manifestUtf8 + "\r\n", JSON.stringify(Object.fromEntries(Object.entries(f.manifest).reverse()))]) {
      const other = inspect(JSON.stringify({ ...f.configuration, manifestUtf8, manifestSha256: hash(manifestUtf8) }));
      expect(other.manifestHash).toBe(base.manifestHash);
      expect(other.configuration.manifestSha256).not.toBe(base.configuration.manifestSha256);
      expect(other.configurationSha256).not.toBe(base.configurationSha256);
      expect(other.configuration.manifestUtf8).toBe(manifestUtf8);
    }
  });
  it("configuration whitespace changes only its byte binding, never normalizes it", () => {
    const f = fixture(), a = inspect(f.utf8), b = inspect(` ${f.utf8}\r\n`);
    expect(a.manifestHash).toBe(b.manifestHash); expect(a.configurationSha256).not.toBe(b.configurationSha256);
  });
  it("accepts exactly 16 KiB and refuses one additional byte", () => {
    const f = fixture(), remaining = PERSONAL_MODEL_INGRESS_LIMITS.configurationUtf8 - Buffer.byteLength(f.utf8);
    expect(remaining).toBeGreaterThan(0);
    const exact = f.utf8 + " ".repeat(remaining);
    expect(inspect(exact).configurationSha256).toBe(hash(exact));
    expect(() => inspect(exact + " ")).toThrow(refused);
  });
  it.each([
    ["mode", "DISABLED"], ["targetProfile", "TRIAL"], ["expectedSourceHead", "c".repeat(40)],
    ["expectedSchemaCatalogSha256", "c".repeat(64)], ["manifestSha256", "c".repeat(64)],
    ["setupRef", "12345678-1234-4234-8234-123456789abd"], ["setupRef", "12345678-1234-1234-8234-123456789abc"],
    ["controllerReceiptRef", "https://example.test/path"], ["controllerReceiptRef", "../secret"],
    ["version", "personal-model-operator-ingress-configuration-v2"], ["apiKey", "UNTRUSTED_SENTINEL"],
  ])("refuses mismatched or additional config %s", (key, value) => {
    const f = fixture(); expect(() => inspect(JSON.stringify({ ...f.configuration, [key]: value }))).toThrow(refused);
  });
  it.each(["2026-09-11T01:15:00.001Z", now, "2026-09-11T00:59:59Z", "2026-02-30T01:05:00Z", "2026-09-11T01:05:00+00:00", "2026-09-11T01:05:00.00Z"])
    ("refuses invalid interval end %s", expiresAt => {
      const f = fixture(); expect(() => inspect(JSON.stringify({ ...f.configuration, expiresAt }))).toThrow(refused);
    });
  it("refuses windows beyond the pinned pilot or before its start", () => {
    const f = fixture();
    for (const [notBefore, expiresAt] of [["2026-10-10T01:18:25Z", "2026-10-10T01:18:27Z"], ["2026-09-10T01:18:25Z", "2026-09-10T01:18:27Z"]])
      expect(() => inspect(JSON.stringify({ ...f.configuration, notBefore, expiresAt }))).toThrow(refused);
  });
  it("window checking uses only supplied time, half-open and without history renewal", () => {
    const f = fixture(), start = Date.parse(now), end = Date.parse(f.configuration.expiresAt);
    expect(() => windowGuard(f.utf8, start)).not.toThrow(); expect(() => windowGuard(f.utf8, end - 1)).not.toThrow();
    for (const t of [start - 1, end, end + 1, NaN, Infinity, String(start), new Date(start)]) expect(() => windowGuard(f.utf8, t)).toThrow(refused);
    const clock = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("NO_AMBIENT_TIME"); });
    expect(inspect(f.utf8).status).toBe("VALIDATED_NOT_AUTHORIZED"); expect(clock).not.toHaveBeenCalled();
  });
  it.each(["\u0000", "\uD800", "\uDC00"])("refuses malformed Unicode before hashing %j", suffix => {
    const f = fixture(); expect(() => inspect(f.utf8 + suffix)).toThrow(refused);
    expect(() => inspect(JSON.stringify({ ...f.configuration, controllerReceiptRef: `a${suffix}` }))).toThrow(refused);
  });
});

describe("deterministic bounded claim and applied archives", () => {
  it("constructs exact namespace/action/hash descriptors with no commit claim", () => {
    const f = fixture(), c = claim(f.utf8, now), i = inspect(f.utf8);
    expect(c.id).toBe(`personal-model-setup:v1:${f.manifest.setupId}:claim`);
    expect(c.action).toBe("personal_model_setup_claimed_v1"); expect(c.actorUserId).toBe(f.manifest.ownerUserId);
    expect(c.fingerprint).toBe(sha256Canonical({ namespace: "personal-model-setup", version: 1, eventKind: "claim",
      setupId: f.manifest.setupId, workspaceId: f.manifest.workspaceId, ownerUserId: f.manifest.ownerUserId,
      manifestSha256: f.configuration.manifestSha256, manifestHash: i.manifestHash, artifactHash: i.artifactHash,
      configurationSha256: i.configurationSha256, sourceHead: f.configuration.expectedSourceHead,
      schemaCatalogSha256: f.configuration.expectedSchemaCatalogSha256, targetProfile: "PERSONAL_PILOT" }));
    expect(c.metadata.manifestUtf8).toBe(f.configuration.manifestUtf8);
    expect(c).not.toHaveProperty("committed"); expect(c.metadata.executionAuthorized).toBe(false);
    expect(readClaim(f.utf8, clone(c))).toEqual(c); expect(Object.isFrozen(c.metadata)).toBe(true);
  });
  it("same setup collides by PK, changed configuration differs in fingerprint", () => {
    const f = fixture(), a = claim(f.utf8, now), later = claim(f.utf8, "2026-09-11T01:01:00.000Z"), b = claim(" " + f.utf8, now);
    expect(a.id).toBe(later.id); expect(a.fingerprint).toBe(later.fingerprint); expect(a.metadata).not.toEqual(later.metadata);
    expect(a.id).toBe(b.id); expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(() => readClaim(" " + f.utf8, a)).toThrow(refused);
  });
  it("derives the closed receipt and applied kind from the actual artifact pins", () => {
    const f = fixture(), c = claim(f.utf8, now), a = applied(f.utf8, c, { publishedAt: now, inspectedAt: "2026-09-11T01:01:00.000Z" });
    expect(a.id).toBe(`personal-model-setup:v1:${f.manifest.setupId}:applied`);
    expect(a.fingerprint).not.toBe(c.fingerprint); expect(a.metadata.claimFingerprint).toBe(c.fingerprint);
    expect(a.metadata.receipt).toMatchObject({ status: "APPLIED_NOT_ACTIVATED", routeHash: f.manifest.artifact.draftRoute.canonicalHash,
      policyHash: f.manifest.artifact.draftPolicy.canonicalHash, executionAuthorized: false, providerVerified: false,
      consentCreated: false, runtimeActivated: false, billingSettled: false, automaticRetry: false });
    expect(Object.isFrozen(a.metadata.receipt)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(a.metadata.receipt))).toBeLessThanOrEqual(16384);
    expect(readApplied(f.utf8, c, clone(a))).toEqual(a);
  });
  it.each(["executionAuthorized", "providerVerified", "consentCreated", "runtimeActivated", "billingSettled", "automaticRetry"])
    ("rejects forged applied receipt authority %s", key => {
      const f = fixture(), c = claim(f.utf8, now), a = clone(applied(f.utf8, c, { publishedAt: now, inspectedAt: now }));
      Object.assign(a.metadata.receipt, { [key]: true }); expect(() => readApplied(f.utf8, c, a)).toThrow(refused);
    });
  it.each(["id", "workspaceId", "actorUserId", "entityType", "entityId", "action", "fingerprint"])
    ("rejects modified claim identity %s", key => {
      const f = fixture(), c = clone(claim(f.utf8, now)); Object.assign(c, { [key]: "foreign" });
      expect(() => readClaim(f.utf8, c)).toThrow(refused);
    });
  it("refuses incomplete, augmented or corrupted archives, not just fingerprints", () => {
    const f = fixture(), c = claim(f.utf8, now);
    for (const metadata of [{ ...c.metadata, manifestUtf8: c.metadata.manifestUtf8 + " " }, { ...c.metadata, extra: false },
      { ...c.metadata, manifestHash: `sha256:${"0".repeat(64)}` }, { ...c.metadata, controllerReceiptRef: "different" }])
      expect(() => readClaim(f.utf8, { ...c, metadata })).toThrow(refused);
    expect(() => readClaim(f.utf8, { ...c, createdAt: now })).toThrow(refused);
    expect(() => readClaim(f.utf8, { ...c, metadata: {} })).toThrow(refused);
  });
  it.each([
    { publishedAt: "2026-09-11T00:59:59Z", inspectedAt: now },
    { publishedAt: "2026-09-11T01:01:00Z", inspectedAt: now },
    { publishedAt: now, inspectedAt: "2026-09-11T01:15:00.000Z" },
    { publishedAt: now, inspectedAt: now, extra: true },
  ])("refuses time/order/shape mismatch %#", times => {
    const f = fixture(); expect(() => applied(f.utf8, claim(f.utf8, now), times)).toThrow(refused);
  });
  it("history validation remains possible later, never creating a fresh attempt window", () => {
    const f = fixture(), c = claim(f.utf8, now), a = applied(f.utf8, c, { publishedAt: now, inspectedAt: now });
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-01T00:00:00Z"));
    expect(readClaim(f.utf8, c)).toEqual(c); expect(readApplied(f.utf8, c, a)).toEqual(a);
    expect(() => windowGuard(f.utf8, Date.parse("2027-01-01T00:00:00Z"))).toThrow(refused);
    expect(clock).not.toHaveBeenCalled();
  });
});

describe("hostile JS preflight and resource bounds", () => {
  it("does not invoke root, metadata or time accessors", () => {
    const f = fixture(), c = claim(f.utf8, now), get = vi.fn(() => now);
    for (const field of ["workspaceId", "metadata"]) {
      const value = clone(c); Object.defineProperty(value, field, { enumerable: true, get });
      expect(() => readClaim(f.utf8, value)).toThrow(refused);
    }
    const times = Object.defineProperty({ inspectedAt: now }, "publishedAt", { enumerable: false, get });
    expect(() => applied(f.utf8, c, times)).toThrow(refused); expect(get).not.toHaveBeenCalled();
  });
  it("rejects proxies before even reflection or array indexing traps", () => {
    const f = fixture(), c = claim(f.utf8, now), trap = vi.fn(() => { throw new Error("TRAP"); });
    for (const target of [{}, [], c]) {
      const value = new Proxy(target, { get: trap, getPrototypeOf: trap, ownKeys: trap });
      expect(() => readClaim(f.utf8, value)).toThrow(refused);
      expect(() => readClaim(f.utf8, { ...c, metadata: value })).toThrow(refused);
    }
    expect(trap).not.toHaveBeenCalled();
  });
  it.each([undefined, NaN, Infinity, 1n, new Date(now), new Map(), () => true, Array(2), Array(257).fill(null),
    JSON.parse('{"__proto__":{}}'), Object.defineProperty({}, "hidden", { value: 1 }), { [Symbol("hidden")]: 1 }])
    ("refuses non-JSON or hidden archive material %#", value => {
      const f = fixture(), c = claim(f.utf8, now); expect(() => readClaim(f.utf8, { ...c, metadata: value })).toThrow(refused);
    });
  it("rejects oversized aggregate before serializing the composite, without a large allocation", () => {
    const f = fixture(), c = claim(f.utf8, now), metadata = { parts: Array(6).fill("x".repeat(90000)) };
    const native = JSON.stringify, stringify = vi.spyOn(JSON, "stringify").mockImplementation((...args: Parameters<typeof JSON.stringify>) => native(...args));
    expect(() => readClaim(f.utf8, { ...c, metadata })).toThrow(refused);
    expect(stringify.mock.calls.filter(([v]) => typeof v === "object" && v !== null)).toHaveLength(0);
  });
  it("bounds depth before canonical hashing", () => {
    const f = fixture(), c = claim(f.utf8, now); let nested: unknown = null;
    for (let n = 0; n < 34; n++) nested = { child: nested };
    expect(() => readClaim(f.utf8, { ...c, metadata: nested })).toThrow(refused);
  });
  it("pure import does not resolve the database module", async () => {
    vi.resetModules(); vi.doMock("@/lib/db", () => { throw new Error("DB_IMPORT_FORBIDDEN"); });
    try {
      const contract = await import("../src/server/model-gateway/personal-intent/operator-ingress-contract");
      expect(contract.inspectPersonalModelIngressConfiguration(fixture().utf8).executionAuthorized).toBe(false);
    } finally { vi.doMock("@/lib/db", () => ({ prisma: {} })); vi.resetModules(); }
  });
});
