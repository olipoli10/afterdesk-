import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { personalModelFixture, requirePersonalDisposableDatabase } from "./personal-model.fixture";
import { enqueuePropertyResearchJob, processPropertyResearchJob, propertyReportForOwner, recoverExpiredPropertyJobs } from "@/server/model-gateway/property-research/jobs";
import type { PropertyTools } from "@/server/model-gateway/property-research/workflow";
import type { RegisteredPropertySource } from "@/server/model-gateway/property-research/contracts";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());
async function fixture() {
  const f = await personalModelFixture("Recherche le lot au 123 rue Exemple, Laval");
  const source = (sourceId: string) => ({ sourceId, url: `https://municipal.example/${sourceId}`, documentVersion: "synthetic-1", effectiveAt: f.now.toISOString(), observedAt: f.now.toISOString() });
  const sources: RegisteredPropertySource[] = (["resolve_address", "find_cadastral_lots", "get_assessment_record", "search_web_with_sources", "lookup_quebec_business"] as const)
    .map(tool => ({ sourceId: tool, tool, allowedHosts: ["municipal.example"], municipality: "Laval", usage: "SYNTHETIC", maxAgeMs: 86400000 }));
  const tools: PropertyTools = {
    resolve_address: vi.fn(async () => ({ candidates: [{ addressId: "a1", address: "123 rue Exemple", municipality: "Laval", source: source("resolve_address") }] })),
    find_cadastral_lots: vi.fn(async () => ({ addressId: "a1", lots: [{ lotId: "1234567", source: source("find_cadastral_lots") }] })),
    get_assessment_record: vi.fn(async ({ lotId }) => ({ lotId, records: [{ listedOwner: "Exemple inc.", ownerKind: "BUSINESS", businessNumber: "1234567890", source: source("get_assessment_record") }] })),
    search_web_with_sources: vi.fn(async () => ({ items: [] })),
    lookup_quebec_business: vi.fn(async ({ businessNumber }) => ({ businessNumber, names: ["Exemple inc."], source: source("lookup_quebec_business") })),
  };
  const registry = { mode: "SYNTHETIC" as const, sources, tools };
  const input = { enabled: true, sourceSmsId: f.sourceOperationId, userId: f.userId, workspaceId: f.workspaceId, address: "123 rue Exemple", municipality: "Laval", registry };
  return { f, input, registry, tools };
}
const signal = () => new AbortController().signal;
describe("durable property queue, synthetic sources and native PostgreSQL", () => {
  it("creates one job and one report across duplicate enqueue and concurrent workers", async () => {
    const { input, registry, tools, f } = await fixture();
    const job = await enqueuePropertyResearchJob(input);
    expect(await enqueuePropertyResearchJob(input)).toMatchObject({ id: job.id, created: false });
    const run = () => processPropertyResearchJob({ enabled: true, id: job.id, registry, signal: signal() });
    const results = await Promise.all([run(), run()]);
    expect(results.filter(r => r.status === "REPORT_STORED")).toHaveLength(1);
    expect(tools.resolve_address).toHaveBeenCalledTimes(1);
    expect(await run()).toMatchObject({ status: "NOT_CLAIMED" });
    expect(await propertyReportForOwner(f.userId, job.id)).toMatchObject({ evidenceMode: "SYNTHETIC", registeredOwnerStatus: "NOT_VERIFIED" });
    const other = await fixture(); expect(await propertyReportForOwner(other.f.userId, job.id)).toBeNull();
    const [row] = await prisma.$queryRawUnsafe<Array<{ progress: unknown[] }>>(`SELECT progress FROM "PersonalPropertyResearchJob" WHERE id=$1`, job.id);
    expect(row.progress).toHaveLength(10);
    await expect(prisma.$executeRawUnsafe(`UPDATE "PersonalPropertyResearchJob" SET report='{}'::jsonb WHERE id=$1`, job.id)).rejects.toThrow();
  });
  it("refuses invented addresses, foreign owners and changed replay source policies", async () => {
    const { input } = await fixture();
    await expect(enqueuePropertyResearchJob({ ...input, address: "999 autre rue" })).rejects.toThrow("PROPERTY_ADDRESS_NOT_IN_SOURCE");
    await expect(enqueuePropertyResearchJob({ ...input, userId: "wrong-user" })).rejects.toThrow();
    await enqueuePropertyResearchJob(input);
    const registry = { ...input.registry, sources: input.registry.sources.map(s => ({ ...s, maxAgeMs: 12345 })) };
    await expect(enqueuePropertyResearchJob({ ...input, registry })).rejects.toThrow("PROPERTY_JOB_REPLAY_CHANGED");
  });
  it("retains a started tool and stops after owner access is withdrawn", async () => {
    const { input, registry, f, tools } = await fixture();
    const job = await enqueuePropertyResearchJob(input);
    const resolve = tools.resolve_address;
    const withdrawn: PropertyTools = { ...tools, resolve_address: async (...args) => {
      await prisma.constructionCommunicationIdentity.update({ where: { id: f.identityId }, data: { status: "revoked" } });
      return resolve(...args);
    } };
    expect(await processPropertyResearchJob({ enabled: true, id: job.id, registry: { ...registry, tools: withdrawn }, signal: signal() })).toMatchObject({ status: "UNCERTAIN" });
    expect(tools.find_cadastral_lots).not.toHaveBeenCalled();
    const [row] = await prisma.$queryRawUnsafe<Array<{ progress: unknown[] }>>(`SELECT progress FROM "PersonalPropertyResearchJob" WHERE id=$1`, job.id);
    expect(row.progress).toMatchObject([{ tool: "resolve_address", status: "STARTED" }]);
    expect(await propertyReportForOwner(f.userId, job.id)).toBeNull();
  });
  it("recovers an expired claimed job without issuing any source call", async () => {
    const { input, tools } = await fixture(); const job = await enqueuePropertyResearchJob(input);
    await prisma.$executeRawUnsafe(`UPDATE "PersonalPropertyResearchJob" SET status='running',attempts=1,"claimToken"='synthetic-crash',"leaseUntil"=(now() AT TIME ZONE 'UTC')-interval '1 second' WHERE id=$1`, job.id);
    expect(await recoverExpiredPropertyJobs()).toMatchObject({ recovered: 0 });
    expect(await recoverExpiredPropertyJobs({ enabled: true })).toMatchObject({ recovered: 1 });
    expect(await recoverExpiredPropertyJobs({ enabled: true })).toMatchObject({ recovered: 0 });
    expect(tools.resolve_address).not.toHaveBeenCalled();
  });
});
