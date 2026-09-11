import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";
import type { Prisma } from "@prisma-client";
import { z } from "zod";

const fail = (): never => { throw new Error("PERSONAL_MODEL_SETUP_REFUSED"); };
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,191}$/);
const version = z.number().int().positive().max(2147483647);
const json = z.record(z.string(), z.unknown());
const labels = z.array(z.string().min(1).max(191)).min(1).max(30);
const common = { id, version, canonicalHash: hash, createdBy: z.string().min(1).max(191), reviewedHashes: json,
  status: z.literal("draft"), publishedAt: z.null() };
const routeSchema = z.object({ ...common, routeKey: z.literal("personal-intent-openrouter-candidate-v1"),
  pathKind: z.literal("gateway_mediated"), adapterKey: z.literal("openrouter-personal-intent-candidate"),
  billingProvider: z.literal("openrouter"), intermediary: z.literal("openrouter"), endpointKey: z.string().min(1).max(160),
  modelKey: z.string().min(1).max(160), operationTypes: z.tuple([z.literal("personal_intent_candidate_v1")]),
  allowedDataClasses: z.tuple([z.literal("personal_data")]), privacyPosture: z.literal("zero_retention"), residency: labels,
  pricingEvidence: json, privacyEvidence: json, maxInputTokens: z.number().int().positive().max(10000000),
  maxOutputTokens: z.number().int().positive().max(8192) }).strict();
const policySchema = z.object({ ...common, policyKey: z.literal("personal-intent-v1"),
  operationType: z.literal("personal_intent_candidate_v1"), routeOrder: z.array(z.object({
    routeKey: z.literal("personal-intent-openrouter-candidate-v1"), version }).strict()).length(1),
  fallbackRules: z.array(z.never()).length(0), maxAttempts: z.literal(1),
  maxTotalCostMicros: z.string().regex(/^[1-9][0-9]{0,18}$/), requiredPrivacyPosture: z.literal("zero_retention"), routeHash: hash }).strict();
const artifactSchema = z.object({ schemaVersion: z.literal(1), status: z.literal("PREPARED_NOT_PUBLISHED"),
  executionAuthorized: z.literal(false), publicationAuthorized: z.literal(false), externalTransportPerformed: z.literal(false),
  reviewAuthenticityVerified: z.literal(false), providerCompatibilityObserved: z.literal(false),
  structuralValidation: z.literal("EXISTING_GATEWAY_RESOLVER_ONLY"), configuration: json, reviewedHashes: json,
  draftRoute: routeSchema, draftPolicy: policySchema, runtimeConfiguration: json,
  disabledSwitches: z.object({ ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: z.literal("false"),
    ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: z.literal("false"), ENDVERA_EXTERNAL_TRANSPORT_ENABLED: z.literal("DISABLED") }).strict(),
  reservation: z.object({ usdMicros: z.string(), cadMicros: z.string(), modelCeilingCadMicros: z.string(), accounting: z.literal("NOT_RESERVED") }).strict(),
  remainingPrerequisites: z.array(z.string().max(191)).max(30), artifactHash: hash }).strict();
const manifestSchema = z.object({ version: z.literal("personal-model-operator-setup-v1"),
  setupId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  expectedHead: z.string().regex(/^[a-f0-9]{40}$/), expectedSchemaCatalogSha256: z.string().regex(/^[a-f0-9]{64}$/),
  authorityId: z.literal("ENDVERA-PERSONAL-20260910-100CAD"), pilotExpiresAt: z.literal("2026-10-10T01:18:26Z"),
  workspaceId: z.string().min(1).max(160), ownerUserId: z.string().min(1).max(191), artifact: artifactSchema }).strict();

// Bounded data-only snapshot. Sorted JSON matches the existing artifact's JSON
// subset without importing evidence.ts (which initializes the application DB).
function snapshot(value: unknown): unknown {
  let nodes = 0, bytes = 0;
  const charge = (n: number) => { bytes += n; if (bytes > 262144) fail(); };
  function visit(v: unknown, depth: number): unknown {
    if (++nodes > 10000 || depth > 30) fail();
    if (v === null || typeof v === "boolean" || typeof v === "string" || typeof v === "number") {
      if (typeof v === "number" && !Number.isFinite(v) || typeof v === "string" && v.length > 32768) fail();
      charge(Buffer.byteLength(JSON.stringify(v), "utf8")); return v;
    }
    if (!v || typeof v !== "object") return fail();
    if (types.isProxy(v)) return fail();
    const array = Array.isArray(v);
    if (array && (Object.getPrototypeOf(v) !== Array.prototype || v.length > 256)) fail();
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail();
    const keys = Reflect.ownKeys(v);
    if (keys.length > 257 || keys.some(k => typeof k !== "string" || k === "__proto__")) fail();
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (array) {
      if (keys.length !== v.length + 1) fail();
      charge(2 + v.length);
      return Array.from({ length: v.length }, (_, i) => {
        const d = descriptors[String(i)]; if (!d || !d.enumerable || !("value" in d)) return fail();
        return visit(d.value, depth + 1);
      });
    }
    charge(2 + keys.length * 2);
    const result: Record<string, unknown> = {};
    for (const k of (keys as string[]).sort()) {
      const d = descriptors[k]; if (!d.enumerable || !("value" in d)) fail();
      charge(Buffer.byteLength(JSON.stringify(k), "utf8")); result[k] = visit(d.value, depth + 1);
    }
    return result;
  }
  return visit(value, 0);
}
const fingerprint = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(snapshot(value)), "utf8").digest("hex")}`;
function frozen<T>(v: T): T { if (v && typeof v === "object") { Object.values(v).forEach(frozen); Object.freeze(v); } return v; }

/** Pure structural/integrity mapping, NOT fresh review validation or authority. */
export function inspectPersonalModelSetupManifest(raw: unknown) {
  try {
    const manifest = manifestSchema.parse(snapshot(raw));
    const artifact = manifest.artifact;
    const { artifactHash, ...artifactBody } = artifact;
    const { canonicalHash: routeHash, status: _rStatus, publishedAt: _rAt, ...routeContent } = artifact.draftRoute;
    const { canonicalHash: policyHash, status: _pStatus, publishedAt: _pAt, ...policyContent } = artifact.draftPolicy;
    void _rStatus; void _rAt; void _pStatus; void _pAt;
    if (fingerprint(artifactBody) !== artifactHash || fingerprint(routeContent) !== routeHash || fingerprint(policyContent) !== policyHash
      || policyContent.routeHash !== routeHash || policyContent.routeOrder[0].version !== routeContent.version
      || fingerprint(artifact.reviewedHashes) !== fingerprint(routeContent.reviewedHashes)
      || fingerprint(artifact.reviewedHashes) !== fingerprint(policyContent.reviewedHashes)) fail();
    const { reviewedHashes: _rHashes, ...route } = routeContent;
    const { reviewedHashes: _pHashes, routeHash: _routeHash, ...policy } = policyContent;
    void _rHashes; void _pHashes; void _routeHash;
    return frozen({ status: "MAPPED_NOT_AUTHORIZED" as const, manifest, manifestHash: fingerprint(manifest),
      route: { ...route, canonicalHash: routeHash }, policy: { ...policy, canonicalHash: policyHash, maxTotalCostMicros: BigInt(policy.maxTotalCostMicros) },
      executionAuthorized: false as const });
  } catch { return fail(); }
}

export type PersonalModelSetupContext = Readonly<{ expectedHead: string; expectedSchemaCatalogSha256: string; expectedArtifactHash: string; expectedManifestHash: string;
  deadlineAt: number; monotoneDeadlineAt: number; signal?: AbortSignal }>;
type Tx = Prisma.TransactionClient;
type Mapped = ReturnType<typeof inspectPersonalModelSetupManifest>;

function invocation(tx: Tx, mapped: Mapped, context: PersonalModelSetupContext, env: NodeJS.ProcessEnv, initial: boolean) {
  if (!tx || "$transaction" in tx || typeof tx.$queryRawUnsafe !== "function") fail();
  const c = { ...context }, m = mapped.manifest;
  if (c.expectedHead !== m.expectedHead || c.expectedSchemaCatalogSha256 !== m.expectedSchemaCatalogSha256
    || c.expectedArtifactHash !== m.artifact.artifactHash || c.expectedManifestHash !== mapped.manifestHash) fail();
  let lastWall = Date.now(), lastMono = performance.now();
  const keyPin = initial ? env.ENDVERA_CONNECTOR_ENCRYPTION_KEY : undefined;
  const wall = Math.min(c.deadlineAt, lastWall + 10000), mono = Math.min(c.monotoneDeadlineAt, lastMono + 10000);
  function live() {
    const currentWall = Date.now(), currentMono = performance.now();
    if (!Number.isFinite(wall) || !Number.isFinite(mono) || !Number.isFinite(currentWall) || !Number.isFinite(currentMono)
      || currentWall < lastWall || currentMono < lastMono || c.signal?.aborted || currentWall >= wall || currentMono >= mono) fail();
    lastWall = currentWall; lastMono = currentMono;
    if (initial && (env.ENDVERA_EXTERNAL_AUTHORITY_REF !== m.authorityId || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== m.pilotExpiresAt
      || env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED !== "false" || env.ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED !== "false")) fail();
    if (initial && env.ENDVERA_CONNECTOR_ENCRYPTION_KEY !== keyPin) fail();
  }
  live();
  return { live, remaining: () => { live(); return Math.min(wall - lastWall, mono - lastMono); },
    deadlineAt: wall, monotoneDeadlineAt: mono, signal: c.signal };
}
async function transaction(tx: Tx, c: ReturnType<typeof invocation>) {
  const isolation = await tx.$queryRawUnsafe<Array<{ transaction_isolation: string }>>("SHOW transaction_isolation"); c.live();
  if (isolation.length !== 1 || isolation[0].transaction_isolation !== "serializable") fail();
  const ms = Math.floor(Math.min(10000, c.remaining()));
  if (ms < 1) fail();
  await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", `${ms}ms`); c.live();
}
async function clock(tx: Tx, c: ReturnType<typeof invocation>) {
  const rows = await tx.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now"); c.live();
  if (rows.length !== 1 || !(rows[0].now instanceof Date) || !Number.isFinite(rows[0].now.getTime())) fail();
  return new Date(rows[0].now.getTime());
}
async function rebuilt(mapped: Mapped, now: Date) {
  const { validatePersonalModelOperatorArtifact } = await import("./operator-preparation");
  if (validatePersonalModelOperatorArtifact(mapped.manifest.artifact, now).status !== "PREPARED_NOT_PUBLISHED") fail();
}
function matches(actual: Record<string, unknown>, expected: Record<string, unknown>) {
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value === "bigint") { if (actual[key] !== value) return false; }
    else if (fingerprint(actual[key]) !== fingerprint(value)) return false;
  }
  return true;
}
async function stored(tx: Tx, mapped: Mapped, c: ReturnType<typeof invocation>) {
  const locks = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM "ModelGatewayRouteProfile" WHERE id=$1 FOR SHARE', mapped.route.id); c.live();
  if (locks.length !== 1 || locks[0].id !== mapped.route.id) fail();
  const policyLocks = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM "ModelGatewayPolicyVersion" WHERE id=$1 FOR SHARE', mapped.policy.id); c.live();
  if (policyLocks.length !== 1 || policyLocks[0].id !== mapped.policy.id) fail();
  const route = await tx.modelGatewayRouteProfile.findUnique({ where: { id: mapped.route.id } }); c.live();
  if (!route || route.status !== "published" || route.retiredAt || !matches(route, mapped.route)
    || !(route.publishedAt instanceof Date) || !Number.isFinite(route.publishedAt.getTime())) return fail();
  // Validate and capture before the next await; ORM result objects are not authority.
  const publishedAtMs = route.publishedAt.getTime();
  const policy = await tx.modelGatewayPolicyVersion.findUnique({ where: { id: mapped.policy.id } }); c.live();
  if (!policy || policy.status !== "published" || policy.retiredAt || !matches(policy, mapped.policy)
    || !(policy.publishedAt instanceof Date) || publishedAtMs !== policy.publishedAt.getTime()) fail();
  return new Date(publishedAtMs);
}

/** No production caller. Caller owns commit/outcome handling; this result is
 * explicitly provisional. Reviews, rates and keys are never sourced from mobile.
 */
export async function applyPersonalModelOperatorSetupInTransaction(tx: Tx, raw: unknown, apiKey: string,
  env: NodeJS.ProcessEnv, context: PersonalModelSetupContext) {
  try {
  const mapped = inspectPersonalModelSetupManifest(raw), c = invocation(tx, mapped, context, env, true);
  await transaction(tx, c);
  const keys = [`personal-model-setup:workspace:${mapped.manifest.workspaceId}`,
    `personal-model-setup:route:${mapped.route.routeKey}:${mapped.route.version}`, `personal-model-setup:policy:${mapped.policy.policyKey}:${mapped.policy.version}`].sort();
  for (const key of keys) { await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS acquired", key); c.live(); }
  const now = await clock(tx, c); await rebuilt(mapped, now); c.live();
  const routeCollision = await tx.modelGatewayRouteProfile.findFirst({ where: { OR: [{ id: mapped.route.id },
    { routeKey: mapped.route.routeKey, version: mapped.route.version }, { canonicalHash: mapped.route.canonicalHash }] }, select: { id: true } }); c.live();
  const policyCollision = await tx.modelGatewayPolicyVersion.findFirst({ where: { OR: [{ id: mapped.policy.id },
    { policyKey: mapped.policy.policyKey, version: mapped.policy.version }, { canonicalHash: mapped.policy.canonicalHash }] }, select: { id: true } }); c.live();
  if (routeCollision || policyCollision) fail();
  const { provisionInitialPersonalModelCredentialInTransaction } = await import("@/server/personal-assistant/model-connection"); c.live();
  await provisionInitialPersonalModelCredentialInTransaction(tx, { userId: mapped.manifest.ownerUserId,
    workspaceId: mapped.manifest.workspaceId, credentialId: mapped.manifest.setupId, apiKey }, env, c); c.live();
  await tx.modelGatewayRouteProfile.create({ data: { ...mapped.route, pricingEvidence: mapped.route.pricingEvidence as Prisma.InputJsonObject,
    privacyEvidence: mapped.route.privacyEvidence as Prisma.InputJsonObject, status: "published", publishedAt: now } }); c.live();
  await tx.modelGatewayPolicyVersion.create({ data: { ...mapped.policy, status: "published", publishedAt: now } }); c.live();
  await stored(tx, mapped, c);
  const finalNow = await clock(tx, c); if (finalNow < now) fail();
  await rebuilt(mapped, finalNow); c.live();
  return frozen({ status: "SETUP_PREPARED_NOT_COMMITTED" as const, setupId: mapped.manifest.setupId,
    artifactHash: mapped.manifest.artifact.artifactHash, manifestHash: mapped.manifestHash, routeHash: mapped.route.canonicalHash, policyHash: mapped.policy.canonicalHash,
    committed: false as const, executionAuthorized: false as const, providerVerified: false as const, consentCreated: false as const,
    budgetAvailabilityVerified: false as const, runtimeActivated: false as const });
  } catch { return fail(); }
}

/** Read-only historical integrity, not renewed review/consent or write replay.
 * Complete archived artifact remains required; hashes alone cannot reconstruct it.
 */
export async function reconcilePersonalModelOperatorSetupInTransaction(tx: Tx, raw: unknown, env: NodeJS.ProcessEnv, context: PersonalModelSetupContext) {
  try {
  const mapped = inspectPersonalModelSetupManifest(raw), c = invocation(tx, mapped, context, env, false);
  await transaction(tx, c);
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT a.id FROM "ConstructionConnectorAccount" a
    JOIN "ConstructionWorkspace" w ON w.id=a."workspaceId"
    JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=$2
    JOIN "User" u ON u.id=m."userId"
    JOIN "ConstructionConnectorCredential" c ON c."connectorAccountId"=a.id AND c."workspaceId"=w.id
    WHERE w.id=$1 AND w.status='active' AND w."ownerUserId"=$2 AND m.role='owner' AND m.status='active'
      AND u.role='CLIENT' AND u."emailVerified"=true AND a.provider='openrouter' AND a."createdByUserId"=$2 AND c.id=$3
    FOR SHARE OF w,m,u,a,c`, mapped.manifest.workspaceId, mapped.manifest.ownerUserId, mapped.manifest.setupId); c.live();
  if (rows.length !== 1) fail();
  const publishedAt = await stored(tx, mapped, c), now = await clock(tx, c);
  if (publishedAt > now) fail();
  await rebuilt(mapped, publishedAt); c.live();
  return frozen({ status: "STORED_SETUP_MATCH_NOT_ACTIVATED" as const, setupId: mapped.manifest.setupId,
    artifactHash: mapped.manifest.artifact.artifactHash, manifestHash: mapped.manifestHash, committed: false as const, executionAuthorized: false as const,
    currentEligibilityVerified: false as const, setupTransactionProvenanceVerified: false as const, providerVerified: false as const });
  } catch { return fail(); }
}
