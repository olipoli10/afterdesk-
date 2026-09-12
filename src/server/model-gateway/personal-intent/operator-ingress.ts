import "server-only";
import { types } from "node:util";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { applyPersonalModelOperatorSetupInTransaction, reconcilePersonalModelOperatorSetupInTransaction } from "./operator-setup";
import { validatePersonalModelOperatorArtifact } from "./operator-preparation";
import { readPersonalOperatorConfiguration as configurationFromEnvironment } from "./operator-configuration-environment";
import { assertPersonalModelIngressWindow, buildPersonalModelSetupApplied, buildPersonalModelSetupClaim,
  inspectPersonalModelIngressConfiguration, inspectPersonalModelSetupApplied, inspectPersonalModelSetupClaim,
  PERSONAL_MODEL_INGRESS_TARGET as target } from "./operator-ingress-contract";

const refused = (): never => { throw new Error("PERSONAL_MODEL_OPERATOR_INGRESS_REFUSED"); };
const unknown = (): never => { throw new Error("PERSONAL_MODEL_OPERATOR_INGRESS_UNKNOWN"); };
const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const actorSchema = z.object({ userId: z.string().min(1).max(191), role: z.literal("CLIENT"), emailVerified: z.literal(true) }).strict();
type Actor = Readonly<{ userId: string; role: string; emailVerified: boolean }>;
export type PersonalModelOperatorIngressContext = Readonly<{ deadlineAt: number; monotoneDeadlineAt: number; signal?: AbortSignal; diagnosticStages?: true }>;
type Tx = Prisma.TransactionClient;
type Receipt = ReturnType<typeof buildPersonalModelSetupApplied>["metadata"]["receipt"];
const publications = new WeakMap<object, () => void>();

function plain(raw: unknown, fields: readonly string[]) {
  if (!raw || typeof raw !== "object" || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return refused();
  const keys = Reflect.ownKeys(raw);
  if (keys.length > fields.length || keys.some(k => typeof k !== "string" || !fields.includes(k))) return refused();
  const copy: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const d = Object.getOwnPropertyDescriptor(raw, key);
    if (!d || !d.enumerable || !("value" in d)) return refused();
    copy[key] = d.value;
  }
  return copy;
}

/** Exact server environment URL shape, not independent endpoint/deployment attestation. */
function databaseUrl(value: unknown, direct: boolean) {
  if (typeof value !== "string" || value.length > 4096 || /[\s\x00-\x1f\\]/.test(value)) refused();
  const u = new URL(value as string);
  if (!["postgres:", "postgresql:"].includes(u.protocol) || u.hash || u.port && u.port !== "5432"
    || u.username !== target.role || !u.password || u.pathname !== `/${target.database}`
    || !(direct ? u.hostname === target.directHostname : u.hostname === target.directHostname || u.hostname === target.pooledHostname)) refused();
  const allowed: Record<string, RegExp> = { sslmode: /^require$/, sslaccept: /^strict$/, channel_binding: /^require$/,
    connect_timeout: /^(?:[1-9]|10)$/, connection_limit: /^[1-9][0-9]?$/, pgbouncer: /^true$/, schema: /^public$/ };
  for (const [key, val] of u.searchParams) if (!allowed[key]?.test(val) || u.searchParams.getAll(key).length !== 1) refused();
  if (u.searchParams.get("sslmode") !== "require") refused();
}

function begin(raw: unknown, env: NodeJS.ProcessEnv, context: PersonalModelOperatorIngressContext, write: boolean) {
  let lastWall = Date.now(), lastMono = performance.now();
  const entry = plain(context, ["deadlineAt", "monotoneDeadlineAt", "signal", "diagnosticStages"]);
  if (typeof entry.deadlineAt !== "number" || typeof entry.monotoneDeadlineAt !== "number"
    || entry.signal !== undefined && (types.isProxy(entry.signal) || !(entry.signal instanceof AbortSignal))
    || entry.diagnosticStages !== undefined && entry.diagnosticStages !== true) refused();
  const signal = entry.signal as AbortSignal | undefined;
  const deadlineAt = Math.min(entry.deadlineAt as number, lastWall + 15000);
  const monotoneDeadlineAt = Math.min(entry.monotoneDeadlineAt as number, lastMono + 15000);
  const input = plain(raw, write ? ["actor", "setupRef", "apiKey"] : ["actor", "setupRef"]);
  const actor = actorSchema.parse(plain(input.actor, ["userId", "role", "emailVerified"]));
  const setupRef = uuid.parse(input.setupRef);
  const apiKey = write ? z.string().regex(/^[A-Za-z0-9_-]{24,512}$/).parse(input.apiKey) : undefined;
  const pins = { configuration: configurationFromEnvironment(env), database: env.DATABASE_URL, direct: env.DIRECT_URL,
    authority: write ? env.ENDVERA_EXTERNAL_AUTHORITY_REF : undefined,
    expiry: write ? env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT : undefined,
    key: write ? env.ENDVERA_CONNECTOR_ENCRYPTION_KEY : undefined };
  const config = inspectPersonalModelIngressConfiguration(pins.configuration);
  if (actor.userId !== config.manifest.ownerUserId || setupRef !== config.configuration.setupRef) refused();
  databaseUrl(pins.database, false); databaseUrl(pins.direct, true);
  let dbDeadline = Infinity, lastDb = -Infinity;
  function live() {
    const wall = Date.now(), mono = performance.now();
    if (!Number.isFinite(wall) || !Number.isFinite(mono) || !Number.isFinite(deadlineAt) || !Number.isFinite(monotoneDeadlineAt)
      || wall < lastWall || mono < lastMono || wall >= deadlineAt || mono >= monotoneDeadlineAt || mono >= dbDeadline || signal?.aborted) refused();
    lastWall = wall; lastMono = mono;
    if (configurationFromEnvironment(env) !== pins.configuration || env.DATABASE_URL !== pins.database || env.DIRECT_URL !== pins.direct) refused();
    if (write && (env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED !== "false" || env.ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED !== "false"
      || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== pins.authority || pins.authority !== config.manifest.authorityId
      || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== pins.expiry || pins.expiry !== config.manifest.pilotExpiresAt
      || env.ENDVERA_CONNECTOR_ENCRYPTION_KEY !== pins.key)) refused();
    if (write && config.manifest.artifact.answerSetup
      && (env.ENDVERA_PERSONAL_ANSWER_ENGINE_ENABLED !== "false"
        || env.ENDVERA_PERSONAL_ANSWER_EXTERNAL_TRANSPORT_ENABLED !== "false")) refused();
    return { wall, mono };
  }
  const remaining = () => { const t = live(); return Math.floor(Math.min(deadlineAt - t.wall, monotoneDeadlineAt - t.mono, dbDeadline - t.mono)); };
  const observeDb = (now: Date, beforeQueryMono: number) => {
    const time = now.getTime(); if (!Number.isFinite(time) || time < lastDb) refused(); lastDb = time;
    if (write) {
      assertPersonalModelIngressWindow(config.configurationUtf8, time);
      if (validatePersonalModelOperatorArtifact(config.manifest.artifact, now).status !== "PREPARED_NOT_PUBLISHED") refused();
      const facts = config.manifest.artifact.configuration;
      const reviewExpires = ["operatorReview", "rateConfiguration", "pilotEnvelopeReview"].map(key =>
        Date.parse((facts[key] as Record<string, unknown>).reviewedAt as string) + 86400000);
      const expires = Math.min(Date.parse(config.configuration.expiresAt), Date.parse(config.manifest.pilotExpiresAt),
        Date.parse((facts.privacyEvidence as Record<string, unknown>).expiresAt as string), ...reviewExpires);
      if (!Number.isFinite(expires) || time >= expires) refused();
      // Conservative query-start anchor: query/commit latency consumes this TTL.
      dbDeadline = Math.min(dbDeadline, beforeQueryMono + expires - time);
    }
    live();
  };
  live();
  return { config, actor, apiKey, live, remaining, observeDb,
    context: { deadlineAt, monotoneDeadlineAt, signal, ...(entry.diagnosticStages === true ? { diagnosticStages: true as const } : {}) } };
}
type Invocation = ReturnType<typeof begin>;

function options(i: Invocation, cap: number) {
  const phase = Math.min(cap, i.remaining()); if (phase < 3) refused();
  const maxWait = Math.min(1000, Math.floor(phase / 3));
  return { isolationLevel: "Serializable" as const, maxWait, timeout: phase - maxWait };
}
async function setupTx(tx: Tx, i: Invocation, cap: number) {
  if (!tx || "$transaction" in tx) refused();
  const rows = await tx.$queryRawUnsafe<Array<{ transaction_isolation: string }>>("SHOW transaction_isolation"); i.live();
  if (rows.length !== 1 || rows[0].transaction_isolation !== "serializable") refused();
  const ms = Math.min(cap, i.remaining()); if (ms < 1) refused();
  await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", `${ms}ms`); i.live();
}
async function clock(tx: Tx, i: Invocation) {
  const sample = i.live();
  const rows = await tx.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now"); i.live();
  if (rows.length !== 1 || !(rows[0].now instanceof Date) || !Number.isFinite(rows[0].now.getTime())) return refused();
  const now = new Date(rows[0].now.getTime()); i.observeDb(now, sample.mono); return now;
}
async function owner(tx: Tx, i: Invocation, consent: boolean) {
  const grantJoins = consent ? `JOIN "ConstructionConnectorAccount" a ON a."workspaceId"=w.id
    JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=a.id` : "";
  const grantWhere = consent ? `AND a.provider='openrouter' AND a."createdByUserId"=$2 AND a."revokedAt" IS NULL
    AND g.capability='personal_model_inference' AND g.status='active' AND g."revokedAt" IS NULL
    AND g."grantedScopes" @> ARRAY['personal_data:inference','authority:ENDVERA-PERSONAL-20260910-100CAD']::text[]
    AND g."grantedAt">=('2026-09-10T01:18:26Z'::timestamptz AT TIME ZONE 'UTC')
    AND g."grantedAt"<=(clock_timestamp() AT TIME ZONE 'UTC')` : "";
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT w.id FROM "ConstructionWorkspace" w
    JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=$2
    JOIN "User" u ON u.id=m."userId" ${grantJoins}
    WHERE w.id=$1 AND w.status='active' AND w."ownerUserId"=$2 AND m.role='owner' AND m.status='active'
    AND u.role='CLIENT' AND u."emailVerified"=true ${grantWhere} FOR SHARE OF w,m,u${consent ? ",g" : ""}`,
  i.config.manifest.workspaceId, i.actor.userId); i.live();
  if (rows.length !== 1 || rows[0].id !== i.config.manifest.workspaceId) refused();
}
function event(row: unknown) {
  const r = plain(row, ["id", "workspaceId", "actorUserId", "entityType", "entityId", "action", "reasonCode", "metadata", "fingerprint", "createdAt"]);
  if (r.reasonCode !== null || !(r.createdAt instanceof Date) || !Number.isFinite(r.createdAt.getTime())) refused();
  return { id: r.id, workspaceId: r.workspaceId, actorUserId: r.actorUserId, entityType: r.entityType,
    entityId: r.entityId, action: r.action, fingerprint: r.fingerprint, metadata: r.metadata };
}
async function findEvent(tx: Tx, id: string, i: Invocation) {
  const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>('SELECT * FROM "ConstructionAuditEvent" WHERE id=$1 FOR SHARE', id); i.live();
  if (rows.length !== 1) return unknown(); return event(rows[0]);
}
async function published(tx: Tx, i: Invocation) {
  const rows = await tx.$queryRawUnsafe<Array<{ publishedAt: Date }>>('SELECT "publishedAt" FROM "ModelGatewayRouteProfile" WHERE id=$1 FOR SHARE', i.config.manifest.artifact.draftRoute.id); i.live();
  if (rows.length !== 1 || !(rows[0].publishedAt instanceof Date) || !Number.isFinite(rows[0].publishedAt.getTime())) return refused();
  return new Date(rows[0].publishedAt.getTime()).toISOString();
}
const coreContext = (i: Invocation) => ({ ...i.context, expectedHead: i.config.configuration.expectedSourceHead,
  expectedSchemaCatalogSha256: i.config.configuration.expectedSchemaCatalogSha256, expectedArtifactHash: i.config.artifactHash,
  expectedManifestHash: i.config.manifestHash });

/** Only known commits register an exact response identity for later serialization.
 * This checks retained context/TTL, not a new DB owner check after lock release. */
export function assertPersonalModelOperatorIngressPublication(value: unknown): void {
  if (!value || typeof value !== "object") return unknown();
  const guard = publications.get(value); if (!guard) return unknown();
  try { guard(); } catch { return unknown(); }
}
function publishReceipt(receipt: Receipt, i: Invocation) {
  i.live(); publications.set(receipt, () => i.live()); return receipt;
}

/** One initial attempt only. No production HTTP caller. No provider or retry. */
export async function applyPersonalModelOperatorIngress(input: Readonly<{ actor: Actor; setupRef: string; apiKey: string }>,
  env: NodeJS.ProcessEnv, context: PersonalModelOperatorIngressContext): Promise<Receipt> {
  let attempted = false;
  try {
    const i = begin(input, env, context, true);
    const claim = await prisma.$transaction(async tx => {
      await setupTx(tx, i, 3000); await owner(tx, i, true);
      const value = buildPersonalModelSetupClaim(i.config.configurationUtf8, (await clock(tx, i)).toISOString());
      const existing = await tx.constructionAuditEvent.findUnique({ where: { id: value.id }, select: { id: true } }); i.live();
      if (existing) { attempted = true; return unknown(); }
      attempted = true;
      await tx.constructionAuditEvent.create({ data: value }); i.live();
      const readback = inspectPersonalModelSetupClaim(i.config.configurationUtf8, await findEvent(tx, value.id, i));
      await clock(tx, i); i.live(); return readback;
    }, options(i, 3000));
    // A resolved transaction promise, not a matching claim lookup, grants this continuation.
    i.live();
    const receipt = await prisma.$transaction(async tx => {
      await setupTx(tx, i, 10000);
      const current = inspectPersonalModelSetupClaim(i.config.configurationUtf8, await findEvent(tx, claim.id, i));
      if (current.metadata.claimedAt !== claim.metadata.claimedAt || current.fingerprint !== claim.fingerprint) unknown();
      await clock(tx, i);
      const result = await applyPersonalModelOperatorSetupInTransaction(tx, i.config.manifest, i.apiKey!, env, coreContext(i)); i.live();
      if (result.status !== "SETUP_PREPARED_NOT_COMMITTED" || result.manifestHash !== i.config.manifestHash || result.committed !== false) unknown();
      const publishedAt = await published(tx, i), inspectedAt = (await clock(tx, i)).toISOString();
      const applied = buildPersonalModelSetupApplied(i.config.configurationUtf8, current, { publishedAt, inspectedAt });
      await tx.constructionAuditEvent.create({ data: applied }); i.live();
      const checked = inspectPersonalModelSetupApplied(i.config.configurationUtf8, current, await findEvent(tx, applied.id, i));
      await clock(tx, i); i.live(); return checked.metadata.receipt;
    }, options(i, 10000));
    return publishReceipt(receipt, i);
  } catch (error) {
    if (context.diagnosticStages && error instanceof Error && /^PERSONAL_MODEL_SETUP_STAGE_[A-Z_]+$/.test(error.message)) throw error;
    return attempted ? unknown() : refused();
  }
}

/** Historical read only; expired configuration/consent/key do not authorize a retry. */
export async function readPersonalModelOperatorIngress(input: Readonly<{ actor: Actor; setupRef: string }>,
  env: NodeJS.ProcessEnv, context: PersonalModelOperatorIngressContext): Promise<Receipt> {
  let reading = false;
  try {
    const i = begin(input, env, context, false);
    const receipt = await prisma.$transaction(async tx => {
      await setupTx(tx, i, 10000); await owner(tx, i, false); reading = true;
      const claim = inspectPersonalModelSetupClaim(i.config.configurationUtf8,
        await findEvent(tx, `personal-model-setup:v1:${i.config.configuration.setupRef}:claim`, i));
      const applied = inspectPersonalModelSetupApplied(i.config.configurationUtf8, claim,
        await findEvent(tx, `personal-model-setup:v1:${i.config.configuration.setupRef}:applied`, i));
      const core = await reconcilePersonalModelOperatorSetupInTransaction(tx, i.config.manifest, env, coreContext(i)); i.live();
      if (core.status !== "STORED_SETUP_MATCH_NOT_ACTIVATED" || core.manifestHash !== i.config.manifestHash) unknown();
      if (await published(tx, i) !== applied.metadata.receipt.publishedAt) unknown();
      const now = await clock(tx, i);
      if (Date.parse(applied.metadata.receipt.inspectedAt) > now.getTime()) unknown();
      i.live(); return applied.metadata.receipt;
    }, options(i, 10000));
    return publishReceipt(receipt, i);
  } catch { return reading ? unknown() : refused(); }
}
