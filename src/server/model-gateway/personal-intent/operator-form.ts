import "server-only";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { inspectPersonalModelIngressConfiguration, PERSONAL_MODEL_INGRESS_TARGET as target } from "./operator-ingress-contract";
import { validatePersonalModelOperatorArtifact } from "./operator-preparation";
import { readPersonalOperatorConfiguration } from "./operator-configuration-environment";

const configKey = "ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION";
const unavailable = Object.freeze({ status: "UNAVAILABLE" as const });
const authentication = Object.freeze({ status: "AUTHENTICATION_REQUIRED" as const });
const fail = (): never => { throw new Error("PERSONAL_MODEL_FORM_UNAVAILABLE"); };

// B2's fixed server URL policy, not independent deployment/endpoint attestation.
// This function never returns or logs a URL, password or hash of either.
function databaseUrl(value: unknown, direct: boolean) {
  if (typeof value !== "string" || value.length > 4096 || /[\s\x00-\x1f\\]/.test(value)) fail();
  const u = new URL(value as string);
  if (!["postgres:", "postgresql:"].includes(u.protocol) || u.hash || u.port && u.port !== "5432"
    || u.username !== target.role || !u.password || u.pathname !== `/${target.database}`
    || !(direct ? u.hostname === target.directHostname : u.hostname === target.directHostname || u.hostname === target.pooledHostname)) fail();
  const allowed: Record<string, RegExp> = { sslmode: /^require$/, sslaccept: /^strict$/, channel_binding: /^require$/,
    connect_timeout: /^(?:[1-9]|10)$/, connection_limit: /^[1-9][0-9]?$/, pgbouncer: /^true$/, schema: /^public$/ };
  for (const [key, val] of u.searchParams) if (!allowed[key]?.test(val) || u.searchParams.getAll(key).length !== 1) fail();
  if (u.searchParams.get("sslmode") !== "require") fail();
}

/** UI observation only, never POST authority. No setup/account/consent writes,
 * archive projection, credential decryption or encryption-key read. */
export async function readPersonalModelOperatorFormView() {
  let stage = "bootstrap";
  try {
    let wall = Date.now(), mono = performance.now();
    if (!Number.isFinite(wall) || !Number.isFinite(mono)) fail();
    const wallDeadline = wall + 5000, monoDeadline = mono + 5000;
    const names = [configKey, "DATABASE_URL", "DIRECT_URL", "ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_PERSONAL_PILOT_EXPIRES_AT",
      "ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED", "ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED"] as const;
    const value = (name: string) => name === configKey ? readPersonalOperatorConfiguration(process.env) : process.env[name];
    const pins = names.map(value);
    function live() {
      const w = Date.now(), m = performance.now();
      if (!Number.isFinite(w) || !Number.isFinite(m) || w < wall || m < mono || w >= wallDeadline || m >= monoDeadline
        || names.some((name, index) => value(name) !== pins[index])) fail();
      wall = w; mono = m;
      return Math.floor(Math.min(wallDeadline - w, monoDeadline - m));
    }
    stage = "configuration";
    const config = inspectPersonalModelIngressConfiguration(pins[0]);
    stage = "database_urls";
    databaseUrl(pins[1], false); databaseUrl(pins[2], true); live();
    stage = "session";
    const user = await getSessionUser(); live();
    if (!user || user.role !== "CLIENT" || user.emailVerified !== true) return authentication;
    const ownerId = user.id;
    if (ownerId !== config.manifest.ownerUserId) return unavailable;
    const workspaceId = config.manifest.workspaceId, setupRef = config.configuration.setupRef;
    const ids = [`personal-model-setup:v1:${setupRef}:claim`, `personal-model-setup:v1:${setupRef}:applied`];
    const left = live(); if (left < 3) fail();
    const maxWait = Math.min(1000, Math.floor(left / 3));
    stage = "database_observation";
    const observation = await prisma.$transaction(async tx => {
      const isolation = await tx.$queryRawUnsafe<Array<{ transaction_isolation: string }>>("SHOW transaction_isolation"); live();
      if (isolation.length !== 1 || isolation[0].transaction_isolation !== "serializable") fail();
      await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", `${live()}ms`); live();
      // No namespace is acquired later. Owner/grant/account SHARE ordering agrees
      // with initial setup; this selector does not become an execution lock token.
      const owners = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT w.id FROM "ConstructionWorkspace" w
        JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=$2
        JOIN "User" u ON u.id=m."userId"
        WHERE w.id=$1 AND w.status='active' AND w."ownerUserId"=$2 AND m.role='owner' AND m.status='active'
        AND u.role='CLIENT' AND u."emailVerified"=true FOR SHARE OF w,m,u`, workspaceId, ownerId); live();
      if (owners.length !== 1 || owners[0].id !== workspaceId) fail();
      // Exact IDs only: even an incomplete/malformed attempt blocks a fresh key.
      const events = await tx.constructionAuditEvent.findMany({ where: { id: { in: ids } }, select: { id: true }, take: 3 }); live();
      if (!Array.isArray(events) || events.length > 2 || new Set(events.map(e => e.id)).size !== events.length
        || events.some(e => !ids.includes(e.id) || Object.keys(e).length !== 1)) fail();
      const gates = pins[3] === config.manifest.authorityId && pins[4] === config.manifest.pilotExpiresAt
        && pins[5] === "false" && pins[6] === "false";
      let eligible = gates && events.length === 0;
      if (eligible) {
        const accounts = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT a.id FROM "ConstructionConnectorAccount" a
          JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=a.id
          WHERE a."workspaceId"=$1 AND a.provider='openrouter' AND a."createdByUserId"=$2
            AND a."credentialRef" IS NULL AND a."revokedAt" IS NULL
            AND g.capability='personal_model_inference' AND g.status='active' AND g."revokedAt" IS NULL
            AND g."grantedScopes" @> ARRAY['personal_data:inference',$3]::text[]
            AND g."grantedAt">=('2026-09-10T01:18:26Z'::timestamptz AT TIME ZONE 'UTC')
            AND g."grantedAt"<=(clock_timestamp() AT TIME ZONE 'UTC') FOR SHARE OF g`, workspaceId, ownerId, `authority:${config.manifest.authorityId}`); live();
        if (accounts.length > 1) fail();
        eligible = accounts.length === 1;
        if (eligible) {
          const accountId = accounts[0].id;
          if (typeof accountId !== "string" || !accountId || accountId.length > 191) fail();
          const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "ConstructionConnectorAccount"
            WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND provider='openrouter'
            AND "credentialRef" IS NULL AND "revokedAt" IS NULL FOR SHARE`, accountId, workspaceId, ownerId); live();
          if (locked.length !== 1 || locked[0].id !== accountId) fail();
          const prior = await tx.constructionConnectorCredential.findFirst({ where: { connectorAccountId: accountId }, select: { id: true } }); live();
          if (prior !== null && (typeof prior.id !== "string" || !prior.id || Object.keys(prior).length !== 1)) fail();
          eligible = prior === null;
        }
      }
      // DB-time expiry, with the query-start monotonic anchor covering commit.
      live(); const beforeQuery = mono;
      const clocks = await tx.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now"); live();
      if (clocks.length !== 1 || !(clocks[0].now instanceof Date) || !Number.isFinite(clocks[0].now.getTime())) fail();
      const db = clocks[0].now.getTime(), facts = config.manifest.artifact.configuration;
      const expiry = Math.min(Date.parse(config.configuration.expiresAt), Date.parse(config.manifest.pilotExpiresAt),
        Date.parse((facts.privacyEvidence as Record<string, unknown>).expiresAt as string),
        ...["operatorReview", "rateConfiguration", "pilotEnvelopeReview"].map(k => Date.parse((facts[k] as Record<string, unknown>).reviewedAt as string) + 86400000));
      if (!Number.isFinite(expiry)) fail();
      eligible = eligible && db >= Date.parse(config.configuration.notBefore) && db < expiry
        && validatePersonalModelOperatorArtifact(config.manifest.artifact, new Date(db)).status === "PREPARED_NOT_PUBLISHED";
      return { eligible, monoExpiry: beforeQuery + expiry - db };
    }, { isolationLevel: "Serializable", maxWait, timeout: left - maxWait });
    stage = "view";
    live();
    const view = Object.freeze({ version: "personal-model-operator-form-v1" as const, setupRef, provider: "openrouter" as const,
      model: config.manifest.artifact.draftRoute.modelKey, providerEndpoint: config.manifest.artifact.draftRoute.endpointKey,
      purpose: "personal_intent_candidate_v1" as const, expiresAt: config.configuration.expiresAt,
      state: observation.eligible && mono < observation.monoExpiry ? "INPUT_AVAILABLE" as const : "HISTORY_ONLY" as const,
      executionAuthorized: false as const, providerVerified: false as const });
    return Object.freeze({ status: "AVAILABLE" as const, view });
  } catch {
    const configBytes = typeof process.env[configKey] === "string"
      ? Buffer.byteLength(process.env[configKey], "utf8")
      : null;
    console.warn("PERSONAL_MODEL_OPERATOR_FORM_UNAVAILABLE", { stage, configBytes });
    return unavailable;
  }
}
