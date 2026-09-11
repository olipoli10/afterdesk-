import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { normalizeAssistantText } from "@/lib/sms-assistant/routing";
import { canonicalFingerprint } from "../evidence";
import { inspectPersonalResearchSource } from "../personal-subject";
import { propertyRequestSchema, propertyReportSchema, type RegisteredPropertySource } from "./contracts";
import { researchProperty, type PropertyTools, type PropertyProgress } from "./workflow";

type Tx = Prisma.TransactionClient;
type Registry = { mode: "SYNTHETIC"; sources: readonly RegisteredPropertySource[]; tools: PropertyTools };
type Job = { id: string; workspaceId: string; userId: string; sourceSmsId: string; request: unknown;
  requestHash: string; authorityHash: string; registryHash: string; status: string; claimToken: string | null; leaseUntil: Date | null };
function registryHash(registry: Registry) {
  // No actual municipal transport is registered in this version. A model or env
  // flag cannot turn an injected source into a permitted live connector.
  if (registry.mode !== "SYNTHETIC" || !registry.sources.length || registry.sources.some(s => s.usage !== "SYNTHETIC")) throw new Error("PROPERTY_LIVE_SOURCE_NOT_REGISTERED");
  return canonicalFingerprint({ mode: registry.mode, sources: registry.sources });
}
async function subject(tx: Tx, job: Pick<Job, "sourceSmsId" | "workspaceId" | "userId" | "authorityHash">) {
  const source = await inspectPersonalResearchSource(tx, { kind: "personal_assistant_operation", operationId: job.sourceSmsId, workspaceId: job.workspaceId });
  if (source.actorUserId !== job.userId || source.authorityFingerprint !== job.authorityHash) throw new Error("PROPERTY_JOB_AUTHORITY_CHANGED");
  return source;
}

/** Called only by a trusted controller with the authenticated owner/workspace.
 * A proposed address must occur in the stored source SMS, not model invention.
 * One source SMS owns one job, even across repeated webhook/controller calls. */
export async function enqueuePropertyResearchJob(input: { enabled?: boolean; sourceSmsId: string; workspaceId: string; userId: string;
  address: string; municipality: string; registry: Registry }) {
  if (input.enabled !== true) throw new Error("PROPERTY_JOB_DISABLED");
  const registry = registryHash(input.registry);
  const request = propertyRequestSchema.parse({ requestId: input.sourceSmsId, workspaceId: input.workspaceId, address: input.address, municipality: input.municipality });
  const requestHash = canonicalFingerprint(request);
  return prisma.$transaction(async tx => {
    const source = await inspectPersonalResearchSource(tx, { kind: "personal_assistant_operation", operationId: input.sourceSmsId, workspaceId: input.workspaceId });
    const body = normalizeAssistantText(source.input.source);
    if (source.actorUserId !== input.userId || !body.includes(normalizeAssistantText(request.address))
      || !body.includes(normalizeAssistantText(request.municipality))) throw new Error("PROPERTY_ADDRESS_NOT_IN_SOURCE");
    if (input.registry.sources.some(s => normalizeAssistantText(s.municipality) !== normalizeAssistantText(request.municipality))) throw new Error("PROPERTY_MUNICIPALITY_NOT_SUPPORTED");
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text', `property:${input.sourceSmsId}`);
    const existing = await tx.$queryRawUnsafe<Job[]>(`SELECT * FROM "PersonalPropertyResearchJob" WHERE "sourceSmsId"=$1`, input.sourceSmsId);
    if (existing.length) {
      if (existing.length !== 1 || existing[0].requestHash !== requestHash || existing[0].registryHash !== registry
        || existing[0].authorityHash !== source.authorityFingerprint) throw new Error("PROPERTY_JOB_REPLAY_CHANGED");
      return { id: existing[0].id, created: false, status: existing[0].status };
    }
    const id = `property_${randomUUID().replaceAll("-", "")}`;
    await tx.$executeRawUnsafe(`INSERT INTO "PersonalPropertyResearchJob"(id,"workspaceId","userId","sourceSmsId",request,"requestHash","authorityHash","registryHash")
      VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`, id, input.workspaceId, input.userId, input.sourceSmsId, JSON.stringify(request), requestHash, source.authorityFingerprint, registry);
    return { id, created: true, status: "pending" };
  }, { isolationLevel: "Serializable", timeout: 5000 });
}

export async function processPropertyResearchJob(input: { enabled?: boolean; id: string; registry: Registry; signal: AbortSignal; timeoutMs?: number }) {
  if (input.enabled !== true) return { status: "DISABLED", actionAuthority: false } as const;
  const registry = registryHash(input.registry), timeout = input.timeoutMs ?? 20000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000) throw new Error("PROPERTY_JOB_DEADLINE_INVALID");
  const token = randomUUID();
  let claimed: Job | null;
  try {
    claimed = await prisma.$transaction(async tx => {
      if (input.signal.aborted) return null;
      const rows = await tx.$queryRawUnsafe<Job[]>(`SELECT * FROM "PersonalPropertyResearchJob" WHERE id=$1 AND status='pending' FOR UPDATE SKIP LOCKED`, input.id);
      if (rows.length !== 1) return null;
      const row = rows[0]; await subject(tx, row);
      if (row.registryHash !== registry || row.requestHash !== canonicalFingerprint(row.request)) throw new Error("PROPERTY_JOB_BINDING_CHANGED");
      await tx.$executeRawUnsafe(`UPDATE "PersonalPropertyResearchJob" SET status='running',attempts=1,"claimToken"=$2,
        "leaseUntil"=(clock_timestamp() AT TIME ZONE 'UTC')+($3*interval '1 millisecond'),"updatedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1`, row.id, token, timeout);
      return row;
    }, { isolationLevel: "Serializable", timeout: 5000 });
  } catch { return { status: "NOT_CLAIMED", actionAuthority: false } as const; }
  if (!claimed) return { status: "NOT_CLAIMED", actionAuthority: false } as const;
  const job = claimed;
  async function current(tx: Tx) {
    if (input.signal.aborted || registryHash(input.registry) !== job.registryHash) throw new Error("PROPERTY_JOB_REVOKED");
    const rows = await tx.$queryRawUnsafe<Job[]>(`SELECT * FROM "PersonalPropertyResearchJob" WHERE id=$1 AND status='running' AND "claimToken"=$2
      AND "leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC') FOR UPDATE`, job.id, token);
    if (rows.length !== 1) throw new Error("PROPERTY_JOB_LEASE_LOST");
    await subject(tx, rows[0]);
  }
  const onProgress = (event: PropertyProgress) => prisma.$transaction(async tx => {
    await current(tx);
    await tx.$executeRawUnsafe(`UPDATE "PersonalPropertyResearchJob" SET progress=progress||$3::jsonb,"updatedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND "claimToken"=$2`,
      job.id, token, JSON.stringify([{ ...event, observedAt: new Date().toISOString() }]));
  }, { isolationLevel: "Serializable", timeout: 2000 });
  try {
    const result = await researchProperty(job.request, { ...input.registry, now: new Date(), signal: input.signal, timeoutMs: timeout, onProgress });
    await prisma.$transaction(async tx => {
      await current(tx);
      await tx.$executeRawUnsafe(`UPDATE "PersonalPropertyResearchJob" SET status='completed',report=$3::jsonb,"reportHash"=$4,
        "claimToken"=NULL,"leaseUntil"=NULL,"updatedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND "claimToken"=$2`,
        job.id, token, JSON.stringify(result.report), canonicalFingerprint(result.report));
    }, { isolationLevel: "Serializable", timeout: 2000 });
    return { status: "REPORT_STORED", id: job.id, evidenceMode: "SYNTHETIC", actionAuthority: false } as const;
  } catch {
    try { await prisma.$executeRawUnsafe(`UPDATE "PersonalPropertyResearchJob" SET status='uncertain',"claimToken"=NULL,"leaseUntil"=NULL,
      "updatedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status='running' AND "claimToken"=$2`, job.id, token); } catch { /* expiry recovery owns unknown persistence */ }
    return { status: "UNCERTAIN", id: job.id, actionAuthority: false } as const;
  }
}

export async function recoverExpiredPropertyJobs(input: { enabled?: boolean; limit?: number } = {}) {
  if (input.enabled !== true) return { recovered: 0, status: "DISABLED" } as const;
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error("PROPERTY_RECOVERY_LIMIT_INVALID");
  const count = await prisma.$executeRawUnsafe(`WITH expired AS (SELECT id FROM "PersonalPropertyResearchJob"
    WHERE status='running' AND "leaseUntil"<=(clock_timestamp() AT TIME ZONE 'UTC') ORDER BY "leaseUntil" LIMIT $1 FOR UPDATE SKIP LOCKED)
    UPDATE "PersonalPropertyResearchJob" j SET status='uncertain',"claimToken"=NULL,"leaseUntil"=NULL,"updatedAt"=(now() AT TIME ZONE 'UTC')
    FROM expired e WHERE j.id=e.id`, limit);
  return { recovered: count, status: "UNCERTAIN_RECORDED_NO_RETRY" } as const;
}

export async function propertyReportForOwner(userId: string, id: string) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRawUnsafe<Array<Job & { report: unknown; reportHash: string }>>(`SELECT * FROM "PersonalPropertyResearchJob" WHERE id=$1 AND "userId"=$2 AND status='completed'`, id, userId);
    if (rows.length !== 1 || canonicalFingerprint(rows[0].report) !== rows[0].reportHash) return null;
    try { await subject(tx, rows[0]); } catch { return null; }
    const parsed = propertyReportSchema.safeParse(rows[0].report);
    if (!parsed.success || parsed.data.workspaceId !== rows[0].workspaceId || parsed.data.requestId !== rows[0].sourceSmsId) return null;
    return parsed.data;
  });
}
