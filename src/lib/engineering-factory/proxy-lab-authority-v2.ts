import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROUTE_ID = /^route-[a-z0-9-]{1,48}$/;
const FAKE_FQDN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ef-proxy-lab\.invalid$/;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const MAX_AUTHORITY_LIFETIME_MS = 10 * 60_000;

export class ProxyLabAuthorityRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyLabAuthorityRefusal";
  }
}

export type ProxyLabPolicyV2 = {
  schemaVersion: 2;
  scope: "provider-free-synthetic-proxy-lab";
  executionAuthorized: false;
  candidateKind: "deterministic-hostile-fixture";
  providerKind: "local-fake-provider";
  killSwitch: { armed: boolean; tripped: boolean };
  route: {
    routeId: string;
    approvedFakeFqdn: string;
    relayMethod: "POST";
    relayPath: string;
    upstreamScheme: "https";
    upstreamPort: number;
    upstreamMethod: "POST";
    upstreamPath: string;
    upstreamIpv4: string;
    dnsIpv4: string;
    dnsPort: number;
    tlsCaSha256: string;
    redirects: 0;
  };
  limits: {
    concurrentConnections: number;
    burstRequests: number;
    sustainedRequestsPerSecond: number;
    maxRequests: number;
    maxHeaderBytes: number;
    maxRequestBodyBytes: number;
    maxResponseBytes: number;
    connectTimeoutMs: number;
    tlsHandshakeTimeoutMs: number;
    firstByteTimeoutMs: number;
    totalRequestTimeoutMs: number;
    syntheticSpendCeilingMicros: number;
    syntheticTokenCeiling: number;
  };
};

export type ProxyLabRuntimeChainEntry = { name: string; sha256: string };

export type ProxyLabManifestV2 = {
  schemaVersion: 2;
  scope: "provider-free-synthetic-proxy-lab";
  executionAuthorized: false;
  artifactHashes: {
    hostileCandidateSha256: string;
    relaySha256: string;
    fakeDnsSha256: string;
    fakeProviderSha256: string;
  };
  runtimeChain: ProxyLabRuntimeChainEntry[];
  topology: {
    candidateNetworkInternal: true;
    candidateNetworkDnsDisabled: true;
    candidateNetworkNoDefaultRoute: true;
    candidateIpv6Disabled: true;
    candidateHostsFileMinimal: true;
    candidateHttpProxyInheritanceDisabled: true;
    runtimePullPolicy: "never";
    candidateMounts: [];
  };
};

type AttestationReference = {
  kind: "policy" | "manifest" | "runtime-chain";
  sha256: string;
  fileName: string;
};

export type ProxyLabAuthorityV2 = {
  schemaVersion: 2;
  kind: "provider-free-synthetic-proxy-lab-authority";
  scope: "provider-free-synthetic-proxy-lab";
  executionAuthorized: false;
  realCandidateInvocations: 0;
  providerCalls: 0;
  runId: string;
  runNonce: string;
  issuedAt: string;
  expiresAt: string;
  signerId: "ef-proxy-lab-local-hmac-v2";
  policySha256: string;
  manifestSha256: string;
  runtimeChainSha256: string;
  attestations: {
    policy: AttestationReference;
    manifest: AttestationReference;
    runtimeChain: AttestationReference;
  };
  hmacSha256: string;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ProxyLabAuthorityRefusal("non-finite number is forbidden");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  throw new ProxyLabAuthorityRefusal("unsupported authority value");
}

export function proxyLabCanonicalJson(value: unknown): string {
  return canonicalize(value);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(value: unknown, signingKey: Buffer): string {
  return createHmac("sha256", signingKey).update(canonicalize(value), "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ProxyLabAuthorityRefusal(`${label} is malformed`);
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ProxyLabAuthorityRefusal(`${label} contains missing or unknown fields`);
  }
}

function positiveInteger(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    throw new ProxyLabAuthorityRefusal(`${label} must be a positive bounded integer`);
  }
  return value as number;
}

function validIpv4(value: unknown, label: string): string {
  if (typeof value !== "string" || !IPV4.test(value)) {
    throw new ProxyLabAuthorityRefusal(`${label} must be a canonical IPv4 literal`);
  }
  const parts = value.split(".").map(Number);
  if (parts.some((part) => part > 255) || parts.join(".") !== value) {
    throw new ProxyLabAuthorityRefusal(`${label} must be a canonical IPv4 literal`);
  }
  return value;
}

function validatePolicy(value: unknown): ProxyLabPolicyV2 {
  const policy = record(value, "policy");
  exactKeys(
    policy,
    [
      "schemaVersion",
      "scope",
      "executionAuthorized",
      "candidateKind",
      "providerKind",
      "killSwitch",
      "route",
      "limits",
    ],
    "policy"
  );
  if (policy.schemaVersion !== 2) throw new ProxyLabAuthorityRefusal("policy schemaVersion must be 2");
  if (policy.scope !== "provider-free-synthetic-proxy-lab") {
    throw new ProxyLabAuthorityRefusal("policy scope must be provider-free synthetic only");
  }
  if (policy.executionAuthorized !== false) {
    throw new ProxyLabAuthorityRefusal("policy can never authorize candidate execution");
  }
  if (policy.candidateKind !== "deterministic-hostile-fixture") {
    throw new ProxyLabAuthorityRefusal("only the deterministic hostile fixture is permitted");
  }
  if (policy.providerKind !== "local-fake-provider") {
    throw new ProxyLabAuthorityRefusal("only the local fake provider is permitted");
  }
  const killSwitch = record(policy.killSwitch, "killSwitch");
  exactKeys(killSwitch, ["armed", "tripped"], "killSwitch");
  if (killSwitch.armed !== true || killSwitch.tripped !== false) {
    throw new ProxyLabAuthorityRefusal("kill switch must be armed and not tripped");
  }

  const route = record(policy.route, "route");
  exactKeys(
    route,
    [
      "routeId",
      "approvedFakeFqdn",
      "relayMethod",
      "relayPath",
      "upstreamScheme",
      "upstreamPort",
      "upstreamMethod",
      "upstreamPath",
      "upstreamIpv4",
      "dnsIpv4",
      "dnsPort",
      "tlsCaSha256",
      "redirects",
    ],
    "route"
  );
  if (typeof route.routeId !== "string" || !ROUTE_ID.test(route.routeId)) {
    throw new ProxyLabAuthorityRefusal("routeId is malformed");
  }
  if (typeof route.approvedFakeFqdn !== "string" || !FAKE_FQDN.test(route.approvedFakeFqdn)) {
    throw new ProxyLabAuthorityRefusal("route host must be an exact synthetic invalid-domain FQDN");
  }
  if (route.relayMethod !== "POST" || route.upstreamMethod !== "POST") {
    throw new ProxyLabAuthorityRefusal("route methods must be exact POST semantics");
  }
  if (route.relayPath !== `/v1/routes/${route.routeId}`) {
    throw new ProxyLabAuthorityRefusal("relay path must bind the exact routeId");
  }
  if (route.upstreamScheme !== "https") {
    throw new ProxyLabAuthorityRefusal("upstream must be HTTPS-only");
  }
  positiveInteger(route.upstreamPort, "upstreamPort", 65_535);
  if (typeof route.upstreamPath !== "string" || !/^\/[A-Za-z0-9/_-]{1,200}$/.test(route.upstreamPath)) {
    throw new ProxyLabAuthorityRefusal("upstream path is malformed");
  }
  validIpv4(route.upstreamIpv4, "upstreamIpv4");
  validIpv4(route.dnsIpv4, "dnsIpv4");
  positiveInteger(route.dnsPort, "dnsPort", 65_535);
  if (typeof route.tlsCaSha256 !== "string" || !SHA256.test(route.tlsCaSha256)) {
    throw new ProxyLabAuthorityRefusal("TLS CA hash is malformed");
  }
  if (route.redirects !== 0) throw new ProxyLabAuthorityRefusal("redirects must remain zero");

  const limits = record(policy.limits, "limits");
  const limitNames = [
    "concurrentConnections",
    "burstRequests",
    "sustainedRequestsPerSecond",
    "maxRequests",
    "maxHeaderBytes",
    "maxRequestBodyBytes",
    "maxResponseBytes",
    "connectTimeoutMs",
    "tlsHandshakeTimeoutMs",
    "firstByteTimeoutMs",
    "totalRequestTimeoutMs",
    "syntheticSpendCeilingMicros",
    "syntheticTokenCeiling",
  ] as const;
  exactKeys(limits, limitNames, "limits");
  for (const name of limitNames) positiveInteger(limits[name], name, 512 * 1024 * 1024);
  if ((limits.concurrentConnections as number) !== 1) {
    throw new ProxyLabAuthorityRefusal("v1 permits exactly one concurrent connection");
  }
  if ((limits.maxRequests as number) > 30) throw new ProxyLabAuthorityRefusal("maxRequests exceeds v1 ceiling");
  if ((limits.maxHeaderBytes as number) > 32 * 1024) throw new ProxyLabAuthorityRefusal("header ceiling exceeds v1");
  if ((limits.maxRequestBodyBytes as number) > 8 * 1024 * 1024) {
    throw new ProxyLabAuthorityRefusal("request body ceiling exceeds v1");
  }
  if ((limits.maxResponseBytes as number) > 32 * 1024 * 1024) {
    throw new ProxyLabAuthorityRefusal("response ceiling exceeds v1");
  }

  return policy as ProxyLabPolicyV2;
}

const REQUIRED_RUNTIME_CHAIN = ["wsl.exe", "podman", "crun", "seccomp", "kernel", "image"] as const;

function validateRuntimeChain(value: unknown): ProxyLabRuntimeChainEntry[] {
  if (!Array.isArray(value) || value.length !== REQUIRED_RUNTIME_CHAIN.length) {
    throw new ProxyLabAuthorityRefusal("runtime chain is incomplete");
  }
  return value.map((entry, index) => {
    const item = record(entry, `runtimeChain[${index}]`);
    exactKeys(item, ["name", "sha256"], `runtimeChain[${index}]`);
    if (item.name !== REQUIRED_RUNTIME_CHAIN[index]) {
      throw new ProxyLabAuthorityRefusal("runtime chain order or identity differs");
    }
    if (typeof item.sha256 !== "string" || !SHA256.test(item.sha256)) {
      throw new ProxyLabAuthorityRefusal("runtime chain hash is malformed");
    }
    return { name: item.name as string, sha256: item.sha256 };
  });
}

function validateManifest(value: unknown): ProxyLabManifestV2 {
  const manifest = record(value, "manifest");
  exactKeys(manifest, ["schemaVersion", "scope", "executionAuthorized", "artifactHashes", "runtimeChain", "topology"], "manifest");
  if (manifest.schemaVersion !== 2 || manifest.scope !== "provider-free-synthetic-proxy-lab") {
    throw new ProxyLabAuthorityRefusal("manifest scope or schema is invalid");
  }
  if (manifest.executionAuthorized !== false) {
    throw new ProxyLabAuthorityRefusal("manifest can never authorize candidate execution");
  }
  const artifacts = record(manifest.artifactHashes, "artifactHashes");
  exactKeys(
    artifacts,
    ["hostileCandidateSha256", "relaySha256", "fakeDnsSha256", "fakeProviderSha256"],
    "artifactHashes"
  );
  for (const [name, digest] of Object.entries(artifacts)) {
    if (typeof digest !== "string" || !SHA256.test(digest)) {
      throw new ProxyLabAuthorityRefusal(`${name} is malformed`);
    }
  }
  validateRuntimeChain(manifest.runtimeChain);
  const topology = record(manifest.topology, "topology");
  exactKeys(
    topology,
    [
      "candidateNetworkInternal",
      "candidateNetworkDnsDisabled",
      "candidateNetworkNoDefaultRoute",
      "candidateIpv6Disabled",
      "candidateHostsFileMinimal",
      "candidateHttpProxyInheritanceDisabled",
      "runtimePullPolicy",
      "candidateMounts",
    ],
    "topology"
  );
  for (const name of [
    "candidateNetworkInternal",
    "candidateNetworkDnsDisabled",
    "candidateNetworkNoDefaultRoute",
    "candidateIpv6Disabled",
    "candidateHostsFileMinimal",
    "candidateHttpProxyInheritanceDisabled",
  ]) {
    if (topology[name] !== true) throw new ProxyLabAuthorityRefusal(`${name} must be true`);
  }
  if (topology.runtimePullPolicy !== "never") throw new ProxyLabAuthorityRefusal("runtime pull policy must be never");
  if (!Array.isArray(topology.candidateMounts) || topology.candidateMounts.length !== 0) {
    throw new ProxyLabAuthorityRefusal("host or runtime mounts are forbidden in the candidate");
  }
  return manifest as ProxyLabManifestV2;
}

function safeAttestationPath(directory: string, reference: AttestationReference, expectedKind: AttestationReference["kind"]): string {
  const item = record(reference, `${expectedKind} attestation reference`);
  exactKeys(item, ["kind", "sha256", "fileName"], `${expectedKind} attestation reference`);
  if (reference.kind !== expectedKind || !SHA256.test(reference.sha256)) {
    throw new ProxyLabAuthorityRefusal(`${expectedKind} attestation reference is malformed`);
  }
  if (reference.fileName !== `${reference.sha256}.json` || basename(reference.fileName) !== reference.fileName) {
    throw new ProxyLabAuthorityRefusal(`${expectedKind} attestation is not content-addressed locally`);
  }
  const root = resolve(directory);
  const file = resolve(root, reference.fileName);
  if (dirname(file) !== root) throw new ProxyLabAuthorityRefusal(`${expectedKind} attestation path escaped its bundle`);
  return file;
}

function authorityUnsigned(authority: ProxyLabAuthorityV2): Omit<ProxyLabAuthorityV2, "hmacSha256"> {
  const unsigned = { ...authority };
  delete (unsigned as Partial<ProxyLabAuthorityV2>).hmacSha256;
  return unsigned;
}

function validateAuthorityShape(value: unknown): ProxyLabAuthorityV2 {
  const authority = record(value, "authority");
  exactKeys(
    authority,
    [
      "schemaVersion",
      "kind",
      "scope",
      "executionAuthorized",
      "realCandidateInvocations",
      "providerCalls",
      "runId",
      "runNonce",
      "issuedAt",
      "expiresAt",
      "signerId",
      "policySha256",
      "manifestSha256",
      "runtimeChainSha256",
      "attestations",
      "hmacSha256",
    ],
    "authority"
  );
  if (
    authority.schemaVersion !== 2 ||
    authority.kind !== "provider-free-synthetic-proxy-lab-authority" ||
    authority.scope !== "provider-free-synthetic-proxy-lab" ||
    authority.executionAuthorized !== false ||
    authority.realCandidateInvocations !== 0 ||
    authority.providerCalls !== 0
  ) {
    throw new ProxyLabAuthorityRefusal("authority is not structurally synthetic-only");
  }
  if (typeof authority.runId !== "string" || !UUID.test(authority.runId)) {
    throw new ProxyLabAuthorityRefusal("runId is malformed");
  }
  if (typeof authority.runNonce !== "string" || !SHA256.test(authority.runNonce)) {
    throw new ProxyLabAuthorityRefusal("runNonce is malformed");
  }
  if (authority.signerId !== "ef-proxy-lab-local-hmac-v2") {
    throw new ProxyLabAuthorityRefusal("authority signer boundary is missing");
  }
  for (const name of ["policySha256", "manifestSha256", "runtimeChainSha256", "hmacSha256"] as const) {
    if (typeof authority[name] !== "string" || !SHA256.test(authority[name] as string)) {
      throw new ProxyLabAuthorityRefusal(`${name} is malformed`);
    }
  }
  const attestations = record(authority.attestations, "attestations");
  exactKeys(attestations, ["policy", "manifest", "runtimeChain"], "attestations");
  return authority as ProxyLabAuthorityV2;
}

async function readJson(file: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new ProxyLabAuthorityRefusal(`${label} is missing or malformed`);
  }
}

export async function createProxyLabAuthorityBundle({
  directory,
  policy: policyInput,
  manifest: manifestInput,
  signingKey,
  runId,
  runNonce = randomBytes(32).toString("hex"),
  issuedAt,
  expiresAt,
}: {
  directory: string;
  policy: ProxyLabPolicyV2;
  manifest: ProxyLabManifestV2;
  signingKey: Buffer;
  runId: string;
  runNonce?: string;
  issuedAt: Date;
  expiresAt: Date;
}): Promise<{
  authority: ProxyLabAuthorityV2;
  authorityFile: string;
  policyFile: string;
  manifestFile: string;
  runtimeChainFile: string;
}> {
  if (signingKey.byteLength < 32) throw new ProxyLabAuthorityRefusal("authority signing key is too short");
  const policy = validatePolicy(policyInput);
  const manifest = validateManifest(manifestInput);
  if (!UUID.test(runId) || !SHA256.test(runNonce)) throw new ProxyLabAuthorityRefusal("run identity is malformed");
  const lifetime = expiresAt.getTime() - issuedAt.getTime();
  if (lifetime <= 0 || lifetime > MAX_AUTHORITY_LIFETIME_MS) {
    throw new ProxyLabAuthorityRefusal("authority lifetime is invalid");
  }

  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const policyJson = canonicalize(policy);
  const manifestJson = canonicalize(manifest);
  const runtimeChainJson = canonicalize(manifest.runtimeChain);
  const policySha256 = sha256(policyJson);
  const manifestSha256 = sha256(manifestJson);
  const runtimeChainSha256 = sha256(runtimeChainJson);
  const policyFile = resolve(root, `${policySha256}.json`);
  const manifestFile = resolve(root, `${manifestSha256}.json`);
  const runtimeChainFile = resolve(root, `${runtimeChainSha256}.json`);
  const authorityFile = resolve(root, "authority-v2.json");
  for (const file of [policyFile, manifestFile, runtimeChainFile, authorityFile]) {
    if (dirname(file) !== root) throw new ProxyLabAuthorityRefusal("authority bundle path escaped its root");
  }
  const unsigned: Omit<ProxyLabAuthorityV2, "hmacSha256"> = {
    schemaVersion: 2,
    kind: "provider-free-synthetic-proxy-lab-authority",
    scope: "provider-free-synthetic-proxy-lab",
    executionAuthorized: false,
    realCandidateInvocations: 0,
    providerCalls: 0,
    runId,
    runNonce,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    signerId: "ef-proxy-lab-local-hmac-v2",
    policySha256,
    manifestSha256,
    runtimeChainSha256,
    attestations: {
      policy: { kind: "policy", sha256: policySha256, fileName: `${policySha256}.json` },
      manifest: { kind: "manifest", sha256: manifestSha256, fileName: `${manifestSha256}.json` },
      runtimeChain: {
        kind: "runtime-chain",
        sha256: runtimeChainSha256,
        fileName: `${runtimeChainSha256}.json`,
      },
    },
  };
  const authority: ProxyLabAuthorityV2 = { ...unsigned, hmacSha256: hmac(unsigned, signingKey) };
  await writeFile(policyFile, policyJson, { encoding: "utf8", flag: "wx" });
  await writeFile(manifestFile, manifestJson, { encoding: "utf8", flag: "wx" });
  await writeFile(runtimeChainFile, runtimeChainJson, { encoding: "utf8", flag: "wx" });
  await writeFile(authorityFile, canonicalize(authority), { encoding: "utf8", flag: "wx" });
  return { authority, authorityFile, policyFile, manifestFile, runtimeChainFile };
}

export async function verifyProxyLabAuthorityBundle({
  directory,
  authorityFile,
  signingKey,
  now,
  replayLedger,
}: {
  directory: string;
  authorityFile: string;
  signingKey: Buffer;
  now: Date;
  replayLedger: Set<string>;
}): Promise<{
  status: "SYNTHETIC_PROXY_LAB_ADMITTED";
  scope: "provider-free-synthetic-proxy-lab";
  executionAuthorized: false;
  runId: string;
  runNonce: string;
  routeId: string;
  policy: ProxyLabPolicyV2;
  manifest: ProxyLabManifestV2;
}> {
  if (signingKey.byteLength < 32) throw new ProxyLabAuthorityRefusal("authority signing key is too short");
  const root = resolve(directory);
  const exactAuthorityFile = resolve(authorityFile);
  if (dirname(exactAuthorityFile) !== root || basename(exactAuthorityFile) !== "authority-v2.json") {
    throw new ProxyLabAuthorityRefusal("authority file escaped its exact bundle path");
  }
  const authority = validateAuthorityShape(await readJson(exactAuthorityFile, "authority"));
  const expectedHmac = hmac(authorityUnsigned(authority), signingKey);
  if (!timingSafeEqual(Buffer.from(authority.hmacSha256, "hex"), Buffer.from(expectedHmac, "hex"))) {
    throw new ProxyLabAuthorityRefusal("authority HMAC is invalid");
  }
  const issuedAt = Date.parse(authority.issuedAt);
  const expiresAt = Date.parse(authority.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    throw new ProxyLabAuthorityRefusal("authority timestamps are malformed");
  }
  if (expiresAt - issuedAt > MAX_AUTHORITY_LIFETIME_MS) {
    throw new ProxyLabAuthorityRefusal("authority lifetime exceeds the local lab maximum");
  }
  if (now.getTime() < issuedAt) throw new ProxyLabAuthorityRefusal("authority is not yet valid");
  if (now.getTime() >= expiresAt) throw new ProxyLabAuthorityRefusal("authority is expired");
  if (replayLedger.has(authority.runNonce)) {
    throw new ProxyLabAuthorityRefusal("run nonce has already been consumed");
  }

  const policyRef = authority.attestations.policy;
  const manifestRef = authority.attestations.manifest;
  const runtimeRef = authority.attestations.runtimeChain;
  const policyFile = safeAttestationPath(root, policyRef, "policy");
  const manifestFile = safeAttestationPath(root, manifestRef, "manifest");
  const runtimeFile = safeAttestationPath(root, runtimeRef, "runtime-chain");
  const [policyBytes, manifestBytes, runtimeBytes] = await Promise.all([
    readFile(policyFile).catch(() => {
      throw new ProxyLabAuthorityRefusal("policy attestation is missing or unresolvable");
    }),
    readFile(manifestFile).catch(() => {
      throw new ProxyLabAuthorityRefusal("manifest attestation is missing or unresolvable");
    }),
    readFile(runtimeFile).catch(() => {
      throw new ProxyLabAuthorityRefusal("runtime-chain attestation is missing or unresolvable");
    }),
  ]);
  if (sha256(policyBytes) !== policyRef.sha256 || policyRef.sha256 !== authority.policySha256) {
    throw new ProxyLabAuthorityRefusal("policy attestation hash mismatch");
  }
  if (sha256(manifestBytes) !== manifestRef.sha256 || manifestRef.sha256 !== authority.manifestSha256) {
    throw new ProxyLabAuthorityRefusal("manifest attestation hash mismatch");
  }
  if (sha256(runtimeBytes) !== runtimeRef.sha256 || runtimeRef.sha256 !== authority.runtimeChainSha256) {
    throw new ProxyLabAuthorityRefusal("runtime-chain attestation hash mismatch");
  }
  let policyRaw: unknown;
  let manifestRaw: unknown;
  let runtimeRaw: unknown;
  try {
    policyRaw = JSON.parse(policyBytes.toString("utf8")) as Json;
    manifestRaw = JSON.parse(manifestBytes.toString("utf8")) as Json;
    runtimeRaw = JSON.parse(runtimeBytes.toString("utf8")) as Json;
  } catch {
    throw new ProxyLabAuthorityRefusal("content-addressed attestation is malformed");
  }
  if (canonicalize(policyRaw) !== policyBytes.toString("utf8")) {
    throw new ProxyLabAuthorityRefusal("policy attestation is not canonical");
  }
  if (canonicalize(manifestRaw) !== manifestBytes.toString("utf8")) {
    throw new ProxyLabAuthorityRefusal("manifest attestation is not canonical");
  }
  if (canonicalize(runtimeRaw) !== runtimeBytes.toString("utf8")) {
    throw new ProxyLabAuthorityRefusal("runtime-chain attestation is not canonical");
  }
  const policy = validatePolicy(policyRaw);
  const manifest = validateManifest(manifestRaw);
  const runtimeChain = validateRuntimeChain(runtimeRaw);
  if (canonicalize(runtimeChain) !== canonicalize(manifest.runtimeChain)) {
    throw new ProxyLabAuthorityRefusal("runtime-chain attestation differs from manifest");
  }
  replayLedger.add(authority.runNonce);
  return {
    status: "SYNTHETIC_PROXY_LAB_ADMITTED",
    scope: "provider-free-synthetic-proxy-lab",
    executionAuthorized: false,
    runId: authority.runId,
    runNonce: authority.runNonce,
    routeId: policy.route.routeId,
    policy,
    manifest,
  };
}
