import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";
import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { inspectPersonalModelSetupManifest } from "./operator-setup";

export const PERSONAL_MODEL_INGRESS_LIMITS = Object.freeze({ configurationUtf8: 32768, manifestUtf8: 262144,
  archiveUtf8: 524288, receiptUtf8: 16384, windowMs: 900000 });
export const PERSONAL_MODEL_INGRESS_TARGET = Object.freeze({ profile: "PERSONAL_PILOT" as const,
  origin: "https://endvera-core-sandbox-afterdesk.vercel.app", vercelProjectId: "prj_cEvjMH8iJ2C9khbZ0vsQlGKQ4Y75",
  neonProjectId: "withered-mud-08129552", branchId: "br-nameless-moon-ax8nmuwj", endpointId: "ep-purple-union-axj3h2t5",
  directHostname: "ep-purple-union-axj3h2t5.c-4.us-east-2.aws.neon.tech",
  pooledHostname: "ep-purple-union-axj3h2t5-pooler.c-4.us-east-2.aws.neon.tech", database: "neondb", role: "neondb_owner" });
const fail = (): never => { throw new Error("PERSONAL_MODEL_INGRESS_CONTRACT_REFUSED"); };
const byteHash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const head = z.string().regex(/^[a-f0-9]{40}$/);
const ref = z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,190}$/);
function unicode(s: string) {
  if (s.includes("\0") || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s)) fail();
}
function text(raw: unknown, limit: number): string {
  if (typeof raw !== "string" || raw.length > limit) return fail();
  unicode(raw); if (Buffer.byteLength(raw, "utf8") > limit) fail(); return raw;
}
function instant(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s)) return fail();
  const ms = Date.parse(s);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== (s.length === 20 ? s.slice(0, -1) + ".000Z" : s)) fail();
  return ms;
}
const utc = z.string().refine(s => { try { instant(s); return true; } catch { return false; } });
function freeze<T>(v: T): T { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }

/** Hostile JS is rejected before getters/proxy traps, not merely after JSON.parse.
 * Running encoded budget precedes composite serialization; no ambient state. */
function snapshot(raw: unknown, limit: number = PERSONAL_MODEL_INGRESS_LIMITS.archiveUtf8): unknown {
  let nodes = 0, bytes = 0;
  const charge = (n: number) => { bytes += n; if (bytes > limit) fail(); };
  function visit(v: unknown, depth: number): unknown {
    if (++nodes > 20000 || depth > 32) fail();
    if (v === null || typeof v === "boolean" || typeof v === "string" || typeof v === "number") {
      if (typeof v === "number" && !Number.isFinite(v)) fail();
      if (typeof v === "string") { if (v.length > 262144) fail(); unicode(v); }
      charge(Buffer.byteLength(JSON.stringify(v), "utf8")); return v;
    }
    if (!v || typeof v !== "object" || types.isProxy(v)) return fail();
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    if (array ? proto !== Array.prototype || v.length > 256 : proto !== Object.prototype && proto !== null) fail();
    const keys = Reflect.ownKeys(v);
    if (keys.length > 257 || keys.some(k => typeof k !== "string" || k === "__proto__" || k.length > 191)) fail();
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (array) {
      if (keys.length !== v.length + 1) fail();
      charge(2 + Math.max(0, v.length - 1));
      return Array.from({ length: v.length }, (_, i) => {
        const d = descriptors[String(i)]; if (!d || !d.enumerable || !("value" in d)) return fail();
        return visit(d.value, depth + 1);
      });
    }
    charge(2 + Math.max(0, keys.length - 1));
    const copy: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const d = descriptors[key]; if (!d.enumerable || !("value" in d)) fail();
      unicode(key); charge(Buffer.byteLength(JSON.stringify(key), "utf8") + 1); copy[key] = visit(d.value, depth + 1);
    }
    return copy;
  }
  const copy = visit(raw, 0);
  if (Buffer.byteLength(JSON.stringify(copy), "utf8") > limit) fail();
  return copy;
}

const configurationSchema = z.object({ version: z.literal("personal-model-operator-ingress-configuration-v1"),
  mode: z.literal("ENABLED"), setupRef: uuid, notBefore: utc, expiresAt: utc, manifestUtf8: z.string(), manifestSha256: sha,
  expectedSourceHead: head, expectedSchemaCatalogSha256: sha, controllerReceiptRef: ref, targetProfile: z.literal("PERSONAL_PILOT") }).strict();

/** Supplied integrity only. Deliberately usable after expiry for history reads.
 * Source/schema/configuration pins and controllerReceiptRef are NOT attestations. */
export function inspectPersonalModelIngressConfiguration(rawUtf8: unknown) {
  try {
    const configurationUtf8 = text(rawUtf8, PERSONAL_MODEL_INGRESS_LIMITS.configurationUtf8);
    const configuration = configurationSchema.parse(snapshot(JSON.parse(configurationUtf8)));
    const manifestUtf8 = text(configuration.manifestUtf8, PERSONAL_MODEL_INGRESS_LIMITS.manifestUtf8);
    if (byteHash(manifestUtf8) !== configuration.manifestSha256) fail();
    const mapped = inspectPersonalModelSetupManifest(snapshot(JSON.parse(manifestUtf8)));
    const m = mapped.manifest, start = instant(configuration.notBefore), end = instant(configuration.expiresAt);
    if (end <= start || end - start > PERSONAL_MODEL_INGRESS_LIMITS.windowMs
      || start < Date.parse("2026-09-10T01:18:26Z") || end > instant(m.pilotExpiresAt)
      || configuration.setupRef !== m.setupId || configuration.expectedSourceHead !== m.expectedHead
      || configuration.expectedSchemaCatalogSha256 !== m.expectedSchemaCatalogSha256) fail();
    return freeze({ status: "VALIDATED_NOT_AUTHORIZED" as const, configurationUtf8, configurationSha256: byteHash(configurationUtf8),
      configuration, manifest: m, manifestHash: mapped.manifestHash, artifactHash: m.artifact.artifactHash,
      executionAuthorized: false as const, controllerEvidenceVerified: false as const });
  } catch { return fail(); }
}
type Inspected = ReturnType<typeof inspectPersonalModelIngressConfiguration>;
export function assertPersonalModelIngressWindow(rawUtf8: unknown, nowMs: unknown): void {
  try {
    const c = inspectPersonalModelIngressConfiguration(rawUtf8).configuration;
    if (typeof nowMs !== "number" || !Number.isFinite(nowMs) || nowMs < instant(c.notBefore) || nowMs >= instant(c.expiresAt)) fail();
  } catch { return fail(); }
}

function identity(i: Inspected, kind: "claim" | "applied") {
  const c = i.configuration, m = i.manifest;
  const descriptor = { namespace: "personal-model-setup", version: 1, eventKind: kind, setupId: c.setupRef,
    workspaceId: m.workspaceId, ownerUserId: m.ownerUserId, manifestSha256: c.manifestSha256, manifestHash: i.manifestHash,
    artifactHash: i.artifactHash, configurationSha256: i.configurationSha256, sourceHead: c.expectedSourceHead,
    schemaCatalogSha256: c.expectedSchemaCatalogSha256, targetProfile: c.targetProfile };
  return { id: `personal-model-setup:v1:${c.setupRef}:${kind}`, workspaceId: m.workspaceId, actorUserId: m.ownerUserId,
    entityType: "personal_model_operator_setup" as const, entityId: c.setupRef,
    action: kind === "claim" ? "personal_model_setup_claimed_v1" as const : "personal_model_setup_applied_v1" as const,
    fingerprint: sha256Canonical(descriptor) };
}
function checked<T>(v: T, limit: number = PERSONAL_MODEL_INGRESS_LIMITS.archiveUtf8): T {
  snapshot(v, limit); return freeze(v);
}
function same(actual: unknown, expected: unknown) {
  if (sha256Canonical(actual) !== sha256Canonical(expected)) fail();
}

/** INSERT descriptor only, never a claimed/committed capability. */
export function buildPersonalModelSetupClaim(rawUtf8: unknown, claimedAt: unknown) {
  try {
    const i = inspectPersonalModelIngressConfiguration(rawUtf8), time = utc.parse(snapshot(claimedAt));
    assertPersonalModelIngressWindow(rawUtf8, instant(time));
    const c = i.configuration;
    return checked({ ...identity(i, "claim"), metadata: { version: "personal-model-setup-claim-v1" as const,
      manifestUtf8: c.manifestUtf8, manifestSha256: c.manifestSha256, manifestHash: i.manifestHash, artifactHash: i.artifactHash,
      configurationSha256: i.configurationSha256, expectedSourceHead: c.expectedSourceHead,
      expectedSchemaCatalogSha256: c.expectedSchemaCatalogSha256, targetProfile: c.targetProfile,
      controllerReceiptRef: c.controllerReceiptRef, claimedAt: time, executionAuthorized: false as const } });
  } catch { return fail(); }
}
const eventSchema = z.object({ id: z.string().max(100), workspaceId: z.string().max(160), actorUserId: z.string().max(191),
  entityType: z.literal("personal_model_operator_setup"), entityId: uuid,
  action: z.enum(["personal_model_setup_claimed_v1", "personal_model_setup_applied_v1"]), fingerprint: sha,
  metadata: z.record(z.string(), z.unknown()) }).strict();
export function inspectPersonalModelSetupClaim(rawUtf8: unknown, rawEvent: unknown) {
  try {
    const event = eventSchema.parse(snapshot(rawEvent));
    const expected = buildPersonalModelSetupClaim(rawUtf8, event.metadata.claimedAt);
    same(event, expected); return expected;
  } catch { return fail(); }
}
const timePair = z.object({ publishedAt: utc, inspectedAt: utc }).strict();

/** Proposed applied metadata, NOT evidence the core or its COMMIT ran. The
 * orchestrator must insert/read back this descriptor in the actual core TX. */
export function buildPersonalModelSetupApplied(rawUtf8: unknown, rawClaim: unknown, rawTimes: unknown) {
  try {
    const i = inspectPersonalModelIngressConfiguration(rawUtf8), claim = inspectPersonalModelSetupClaim(rawUtf8, rawClaim);
    const times = timePair.parse(snapshot(rawTimes)), published = instant(times.publishedAt), inspected = instant(times.inspectedAt);
    if (published < instant(claim.metadata.claimedAt) || inspected < published) fail();
    assertPersonalModelIngressWindow(rawUtf8, inspected);
    const c = i.configuration, a = i.manifest.artifact;
    const receipt = checked({ version: "personal-model-setup-receipt-v1" as const, status: "APPLIED_NOT_ACTIVATED" as const,
      setupRef: c.setupRef, targetProfile: c.targetProfile, sourceHead: c.expectedSourceHead,
      schemaCatalogSha256: c.expectedSchemaCatalogSha256, manifestSha256: c.manifestSha256, manifestHash: i.manifestHash,
      artifactHash: i.artifactHash, configurationSha256: i.configurationSha256,
      routeId: a.draftRoute.id, routeHash: a.draftRoute.canonicalHash, policyId: a.draftPolicy.id, policyHash: a.draftPolicy.canonicalHash,
      ...times, executionAuthorized: false as const, providerVerified: false as const, consentCreated: false as const,
      runtimeActivated: false as const, billingSettled: false as const, automaticRetry: false as const }, PERSONAL_MODEL_INGRESS_LIMITS.receiptUtf8);
    return checked({ ...identity(i, "applied"), metadata: { version: "personal-model-setup-applied-v1" as const,
      claimFingerprint: claim.fingerprint, receipt } });
  } catch { return fail(); }
}
export function inspectPersonalModelSetupApplied(rawUtf8: unknown, rawClaim: unknown, rawEvent: unknown) {
  try {
    const event = eventSchema.parse(snapshot(rawEvent));
    const receipt = z.object({ publishedAt: utc, inspectedAt: utc }).passthrough().parse(event.metadata.receipt);
    const expected = buildPersonalModelSetupApplied(rawUtf8, rawClaim, { publishedAt: receipt.publishedAt, inspectedAt: receipt.inspectedAt });
    same(event, expected); return expected;
  } catch { return fail(); }
}
