import { describe, expect, it, vi } from "vitest";
import { researchProperty, type PropertyTools } from "../../src/server/model-gateway/property-research/workflow";
import type { RegisteredPropertySource } from "../../src/server/model-gateway/property-research/contracts";

const now = new Date("2026-09-11T15:00:00Z");
const request = { requestId: "synthetic-request", workspaceId: "synthetic-workspace", address: "123 rue Exemple", municipality: "Laval" };
const source = (sourceId: string) => ({ sourceId, url: `https://municipal.example/${sourceId}`, documentVersion: "synthetic-1", effectiveAt: "2026-09-10T15:00:00Z", observedAt: now.toISOString() });
const registered = (["resolve_address", "find_cadastral_lots", "get_assessment_record", "search_web_with_sources", "lookup_quebec_business"] as const).map(tool => ({
  sourceId: tool, tool, allowedHosts: ["municipal.example"], municipality: "Laval", usage: "SYNTHETIC", maxAgeMs: 7 * 86400_000,
})) satisfies RegisteredPropertySource[];
const address = { addressId: "address-1", address: request.address, municipality: "Laval", source: source("resolve_address") };
function tools(): PropertyTools {
  return {
    resolve_address: vi.fn(async () => ({ candidates: [address] })),
    find_cadastral_lots: vi.fn(async () => ({ addressId: "address-1", lots: ["1234567", "7654321"].map(lotId => ({ lotId, source: source("find_cadastral_lots") })) })),
    get_assessment_record: vi.fn(async ({ lotId }) => ({ lotId, records: [{ listedOwner: "Exemple Terrain inc.", ownerKind: "BUSINESS", businessNumber: "1234567890", source: source("get_assessment_record") }] })),
    search_web_with_sources: vi.fn(async () => ({ items: [] })),
    lookup_quebec_business: vi.fn(async ({ businessNumber }) => ({ businessNumber, names: ["Exemple Terrain inc."], source: source("lookup_quebec_business") })),
  };
}
const run = (t = tools()) => researchProperty(request, { tools: t, sources: registered, mode: "SYNTHETIC", now, signal: new AbortController().signal });

describe("property research toolchain", () => {
  it("keeps multiple lots and reports assessment owners without certifying legal title", async () => {
    const t = tools(), result = await run(t);
    expect(result.report).toMatchObject({ status: "SOURCES_COLLECTED", registeredOwnerStatus: "NOT_VERIFIED", actionAuthority: false, evidenceMode: "SYNTHETIC" });
    expect(result.report.lots.map(l => l.lotId)).toEqual(["1234567", "7654321"]);
    expect(t.lookup_quebec_business).toHaveBeenCalledTimes(1);
    expect(new Set(result.receipts.map(r => r.tool)).size).toBe(6);
    expect(result.receipts.every(r => r.automaticRetry === false)).toBe(true);
  });
  it("retains stale owner contradictions and mismatching business names", async () => {
    const t = { ...tools(), get_assessment_record: async ({ lotId }: { lotId: string }) => ({ lotId, records: [
      { listedOwner: "Ancien propriétaire inc.", ownerKind: "BUSINESS", businessNumber: "1234567890", source: { ...source("get_assessment_record"), effectiveAt: "2024-01-01T00:00:00Z" } },
      { listedOwner: "Autre société inc.", ownerKind: "BUSINESS", businessNumber: "1234567890", source: source("get_assessment_record") },
    ] }) };
    const { report } = await run(t);
    expect(report.status).toBe("PARTIAL");
    expect(report.findings.map(f => f.code)).toEqual(expect.arrayContaining(["SOURCE_STALE", "OWNER_CONTRADICTION", "COMPANY_NAME_MISMATCH"]));
    expect(report.lots[0].assessment).toHaveLength(2);
    expect(report.registeredOwnerStatus).toBe("NOT_VERIFIED");
  });
  it("asks which address instead of selecting an arbitrary first candidate", async () => {
    const t = tools();
    const { report } = await run({ ...t, resolve_address: async () => ({ candidates: [address, { ...address, addressId: "address-2" }] }) });
    expect(report.status).toBe("CLARIFICATION_REQUIRED");
    expect(t.find_cadastral_lots).not.toHaveBeenCalled();
    expect(t.search_web_with_sources).not.toHaveBeenCalled();
  });
  it("does not use an assessment for a different parcel or an unregistered source", async () => {
    const t = tools();
    const result = await run({ ...t, get_assessment_record: async () => ({ lotId: "0000000", records: [] }) });
    expect(result.report.lots[0].assessment).toEqual([]);
    expect(result.report.status).toBe("PARTIAL");
    const wrong = await run({ ...t, resolve_address: async () => ({ candidates: [{ ...address, source: { ...address.source, url: "https://attacker.example/address" } }] }) });
    expect(wrong.report.address).toBeNull();
  });
  it("does not expose assessment-roll people to web search or business lookups", async () => {
    const t = tools();
    const { report } = await run({ ...t, get_assessment_record: async ({ lotId }) => ({ lotId, records: [
      { listedOwner: "Personne synthétique", ownerKind: "PERSON", businessNumber: null, source: source("get_assessment_record") },
    ] }) });
    expect(report.lots[0].assessment[0].listedOwner).toBe("Personne synthétique");
    expect(t.search_web_with_sources).toHaveBeenCalledWith({ address: request.address, municipality: "Laval" }, expect.any(AbortSignal));
    expect(t.lookup_quebec_business).not.toHaveBeenCalled();
  });
  it("continues independent sources after a failure and does not replay the failed tool", async () => {
    const t = tools(), badAssessment = vi.fn(async () => { throw new Error("secret provider response"); });
    const result = await run({ ...t, get_assessment_record: badAssessment });
    expect(t.search_web_with_sources).toHaveBeenCalledTimes(1);
    expect(badAssessment).toHaveBeenCalledTimes(2); // one per DIFFERENT lot
    expect(JSON.stringify(result)).not.toContain("secret provider");
    expect(result.receipts.filter(r => r.status === "UNAVAILABLE")).toHaveLength(2);
  });
  it("cancels a hanging source without proceeding or retrying", async () => {
    vi.useFakeTimers();
    try {
      const t = tools(), hanging = vi.fn<PropertyTools["resolve_address"]>(() => new Promise(() => {}));
      const pending = researchProperty(request, { tools: { ...t, resolve_address: hanging }, sources: registered, mode: "SYNTHETIC", now, signal: new AbortController().signal, timeoutMs: 50 });
      const rejected = expect(pending).rejects.toThrow("PROPERTY_WORK_INTERRUPTED");
      await vi.advanceTimersByTimeAsync(51); await rejected;
      expect(hanging).toHaveBeenCalledTimes(1); expect(t.find_cadastral_lots).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("refuses unsupported municipalities and synthetic sources in public mode", async () => {
    await expect(researchProperty({ ...request, municipality: "Montréal" }, { tools: tools(), sources: registered, mode: "SYNTHETIC", now, signal: new AbortController().signal })).rejects.toThrow("PROPERTY_MUNICIPALITY_OR_SOURCE_NOT_SUPPORTED");
    await expect(researchProperty(request, { tools: tools(), sources: registered, mode: "PERMITTED_PUBLIC", now, signal: new AbortController().signal })).rejects.toThrow("PROPERTY_MUNICIPALITY_OR_SOURCE_NOT_SUPPORTED");
  });
});
