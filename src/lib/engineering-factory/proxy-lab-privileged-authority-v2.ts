import {
  createHash,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import {
  proxyLabCanonicalJson,
  verifyProxyLabAuthorityBundle,
} from "./proxy-lab-authority-v2";

const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_AUTHORITY_LIFETIME_MS = 10 * 60_000;

export const PRIVILEGED_PROXY_LAB_MUTATIONS = [
  "root-firewall-table-missing",
  "root-firewall-default-accept",
  "root-firewall-direct-provider-bypass",
  "root-firewall-dns-bypass",
  "root-firewall-ipv6-bypass",
  "root-firewall-metadata-bypass",
  "root-firewall-host-gateway-bypass",
  "root-firewall-candidate-can-edit",
  "observer-inside-rootless-runtime",
  "observer-packet-evidence-omitted",
  "observer-content-capture-enabled",
  "observer-evidence-hash-mismatch",
  "authority-firewall-hash-unbound",
  "authority-observer-hash-unbound",
  "authority-before-after-drift-ignored",
  "kill-switch-terminates-before-block",
  "rollback-rule-leak-accepted",
  "cleanup-observer-process-leak",
] as const;

export type ProxyLabPrivilegedMutationName = (typeof PRIVILEGED_PROXY_LAB_MUTATIONS)[number];

export class ProxyLabPrivilegedAuthorityRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyLabPrivilegedAuthorityRefusal";
  }
}

export type ProxyLabPrivilegedBoundaryPayloadV2 = {
  schemaVersion: 2;
  kind: "provider-free-synthetic-privileged-boundary-proof";
  scope: "provider-free-synthetic-proxy-lab";
  executionAuthorized: false;
  realCandidateInvocations: 0;
  providerCalls: 0;
  runId: string;
  runNonce: string;
  issuedAt: string;
  expiresAt: string;
  routeAuthoritySha256: string;
  routeAuthorityVerifiedAt: string;
  firewall: {
    ownerUid: 0;
    defaultDeny: true;
    candidateCanEdit: false;
    rulesetSha256: string;
    controllerIdentitySha256: string;
    controllerBinarySha256: string;
    nftBinarySha256: string;
    exactCandidateRelay: "10.241.0.2:8443";
    exactRelayDns: "10.242.0.53:5353";
    exactRelayProvider: string;
  };
  observer: {
    controlledOutsideRootlessRuntime: true;
    contentCaptureEnabled: false;
    configurationSha256: string;
    binarySha256: string;
    runtimeSha256: string;
    packetEvidenceSha256: string;
  };
  state: {
    beforeSha256: string;
    afterSha256: string;
    driftDetected: false;
  };
  cleanup: {
    attestationSha256: string;
    verified: true;
    rulesLeak: false;
    observerProcessLeak: false;
    namespaceLeak: false;
    networkLeak: false;
    secretLeak: false;
  };
  killSwitch: {
    proofSha256: string;
    blockedBeforeTermination: true;
    candidateAliveAfterBlock: true;
    successfulPacketsAfterBlock: 0;
    dropCounterDelta: number;
  };
  mutations: Array<{
    name: ProxyLabPrivilegedMutationName;
    gate: ProxyLabPrivilegedMutationName;
    status: "caught-and-byte-restored";
    sourceBeforeSha256: string;
    sourceAfterSha256: string;
  }>;
};

type ReferenceKind =
  | "route-authority"
  | "privileged-boundary"
  | "controller-public-key"
  | "controller-signature";

type AttestationReference = {
  kind: ReferenceKind;
  sha256: string;
  fileName: string;
};

export type ProxyLabPrivilegedAuthorityV2 = {
  schemaVersion: 2;
  kind: "provider-free-synthetic-proxy-lab-privileged-authority";
  scope: "provider-free-synthetic-proxy-lab";
  executionAuthorized: false;
  realCandidateInvocations: 0;
  providerCalls: 0;
  runId: string;
  runNonce: string;
  issuedAt: string;
  expiresAt: string;
  signerId: "ef-proxy-lab-local-hmac-v2";
  privilegedSignerId: "ef-privileged-wsl-root-rsa-v1";
  routeAuthoritySha256: string;
  routeAuthorityVerifiedAt: string;
  firewallRulesetSha256: string;
  firewallControllerIdentitySha256: string;
  observerConfigurationSha256: string;
  observerPacketEvidenceSha256: string;
  beforeStateSha256: string;
  afterStateSha256: string;
  cleanupAttestationSha256: string;
  killSwitchProofSha256: string;
  attestations: {
    routeAuthority: AttestationReference;
    privilegedBoundary: AttestationReference;
    controllerPublicKey: AttestationReference;
    controllerSignature: AttestationReference;
  };
  hmacSha256: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new ProxyLabPrivilegedAuthorityRefusal(`${label} is malformed`);
  return value;
}

function exactKeys(value: JsonRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ProxyLabPrivilegedAuthorityRefusal(`${label} contains missing or unknown fields`);
  }
}

function validHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new ProxyLabPrivilegedAuthorityRefusal(`${label} is not a SHA-256 fingerprint`);
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(value: unknown, key: Buffer): string {
  return createHmac("sha256", key).update(proxyLabCanonicalJson(value), "utf8").digest("hex");
}

function unsignedAuthority(
  authority: ProxyLabPrivilegedAuthorityV2
): Omit<ProxyLabPrivilegedAuthorityV2, "hmacSha256"> {
  const unsigned = { ...authority };
  delete (unsigned as Partial<ProxyLabPrivilegedAuthorityV2>).hmacSha256;
  return unsigned;
}

function validateTimes(issuedAtRaw: unknown, expiresAtRaw: unknown): { issuedAt: number; expiresAt: number } {
  if (typeof issuedAtRaw !== "string" || typeof expiresAtRaw !== "string") {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged evidence timestamps are malformed");
  }
  const issuedAt = Date.parse(issuedAtRaw);
  const expiresAt = Date.parse(expiresAtRaw);
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_AUTHORITY_LIFETIME_MS
  ) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged evidence lifetime is invalid");
  }
  return { issuedAt, expiresAt };
}

function validatePayload(value: unknown): ProxyLabPrivilegedBoundaryPayloadV2 {
  const payload = record(value, "privileged boundary payload");
  exactKeys(
    payload,
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
      "routeAuthoritySha256",
      "routeAuthorityVerifiedAt",
      "firewall",
      "observer",
      "state",
      "cleanup",
      "killSwitch",
      "mutations",
    ],
    "privileged boundary payload"
  );
  if (
    payload.schemaVersion !== 2 ||
    payload.kind !== "provider-free-synthetic-privileged-boundary-proof" ||
    payload.scope !== "provider-free-synthetic-proxy-lab" ||
    payload.executionAuthorized !== false ||
    payload.realCandidateInvocations !== 0 ||
    payload.providerCalls !== 0
  ) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged proof is not structurally synthetic-only");
  }
  if (typeof payload.runId !== "string" || !UUID.test(payload.runId)) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged runId is malformed");
  }
  validHash(payload.runNonce, "privileged runNonce");
  validateTimes(payload.issuedAt, payload.expiresAt);
  validHash(payload.routeAuthoritySha256, "route authority hash");
  if (typeof payload.routeAuthorityVerifiedAt !== "string") {
    throw new ProxyLabPrivilegedAuthorityRefusal("route authority verification time is malformed");
  }
  const routeAuthorityVerifiedAt = Date.parse(payload.routeAuthorityVerifiedAt);
  const proofIssuedAt = Date.parse(payload.issuedAt as string);
  if (!Number.isFinite(routeAuthorityVerifiedAt) || routeAuthorityVerifiedAt > proofIssuedAt) {
    throw new ProxyLabPrivilegedAuthorityRefusal("route authority verification time is not historical");
  }

  const firewall = record(payload.firewall, "privileged firewall evidence");
  exactKeys(
    firewall,
    [
      "ownerUid",
      "defaultDeny",
      "candidateCanEdit",
      "rulesetSha256",
      "controllerIdentitySha256",
      "controllerBinarySha256",
      "nftBinarySha256",
      "exactCandidateRelay",
      "exactRelayDns",
      "exactRelayProvider",
    ],
    "privileged firewall evidence"
  );
  if (firewall.ownerUid !== 0 || firewall.defaultDeny !== true || firewall.candidateCanEdit !== false) {
    throw new ProxyLabPrivilegedAuthorityRefusal("root-owned firewall ownership or default-deny evidence is invalid");
  }
  for (const name of ["rulesetSha256", "controllerIdentitySha256", "controllerBinarySha256", "nftBinarySha256"]) {
    validHash(firewall[name], `firewall ${name}`);
  }
  if (
    firewall.exactCandidateRelay !== "10.241.0.2:8443" ||
    firewall.exactRelayDns !== "10.242.0.53:5353" ||
    typeof firewall.exactRelayProvider !== "string" ||
    !/^10\.242\.0\.10:944[3-6]$/.test(firewall.exactRelayProvider)
  ) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged firewall route binding is not exact");
  }

  const observer = record(payload.observer, "privileged observer evidence");
  exactKeys(
    observer,
    [
      "controlledOutsideRootlessRuntime",
      "contentCaptureEnabled",
      "configurationSha256",
      "binarySha256",
      "runtimeSha256",
      "packetEvidenceSha256",
    ],
    "privileged observer evidence"
  );
  if (observer.controlledOutsideRootlessRuntime !== true || observer.contentCaptureEnabled !== false) {
    throw new ProxyLabPrivilegedAuthorityRefusal("observer is not independent and metadata-only");
  }
  for (const name of ["configurationSha256", "binarySha256", "runtimeSha256", "packetEvidenceSha256"]) {
    validHash(observer[name], `observer ${name}`);
  }

  const state = record(payload.state, "before/after state evidence");
  exactKeys(state, ["beforeSha256", "afterSha256", "driftDetected"], "before/after state evidence");
  const before = validHash(state.beforeSha256, "before state hash");
  const after = validHash(state.afterSha256, "after state hash");
  if (state.driftDetected !== false || before !== after) {
    throw new ProxyLabPrivilegedAuthorityRefusal("before/after privileged host state drift is not closed");
  }

  const cleanup = record(payload.cleanup, "cleanup attestation");
  exactKeys(
    cleanup,
    [
      "attestationSha256",
      "verified",
      "rulesLeak",
      "observerProcessLeak",
      "namespaceLeak",
      "networkLeak",
      "secretLeak",
    ],
    "cleanup attestation"
  );
  validHash(cleanup.attestationSha256, "cleanup attestation hash");
  if (
    cleanup.verified !== true ||
    cleanup.rulesLeak !== false ||
    cleanup.observerProcessLeak !== false ||
    cleanup.namespaceLeak !== false ||
    cleanup.networkLeak !== false ||
    cleanup.secretLeak !== false
  ) {
    throw new ProxyLabPrivilegedAuthorityRefusal("cleanup attestation contains a leak or is unverified");
  }

  const killSwitch = record(payload.killSwitch, "kill-switch proof");
  exactKeys(
    killSwitch,
    [
      "proofSha256",
      "blockedBeforeTermination",
      "candidateAliveAfterBlock",
      "successfulPacketsAfterBlock",
      "dropCounterDelta",
    ],
    "kill-switch proof"
  );
  validHash(killSwitch.proofSha256, "kill-switch proof hash");
  if (
    killSwitch.blockedBeforeTermination !== true ||
    killSwitch.candidateAliveAfterBlock !== true ||
    killSwitch.successfulPacketsAfterBlock !== 0 ||
    !Number.isSafeInteger(killSwitch.dropCounterDelta) ||
    (killSwitch.dropCounterDelta as number) <= 0
  ) {
    throw new ProxyLabPrivilegedAuthorityRefusal("kill switch did not block before candidate termination");
  }

  if (!Array.isArray(payload.mutations) || payload.mutations.length !== PRIVILEGED_PROXY_LAB_MUTATIONS.length) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged mutation catalog is incomplete or reordered");
  }
  payload.mutations.forEach((entry, index) => {
    const mutation = record(entry, `privileged mutation ${index}`);
    exactKeys(
      mutation,
      ["name", "gate", "status", "sourceBeforeSha256", "sourceAfterSha256"],
      `privileged mutation ${index}`
    );
    const expected = PRIVILEGED_PROXY_LAB_MUTATIONS[index];
    if (mutation.name !== expected || mutation.gate !== expected || mutation.status !== "caught-and-byte-restored") {
      throw new ProxyLabPrivilegedAuthorityRefusal("privileged mutation catalog is incomplete or reordered");
    }
    const sourceBefore = validHash(mutation.sourceBeforeSha256, `${expected} before hash`);
    const sourceAfter = validHash(mutation.sourceAfterSha256, `${expected} after hash`);
    if (sourceBefore !== sourceAfter) {
      throw new ProxyLabPrivilegedAuthorityRefusal(`${expected} was not restored byte-exactly`);
    }
  });

  return payload as ProxyLabPrivilegedBoundaryPayloadV2;
}

function safeReferencePath(
  directory: string,
  reference: AttestationReference,
  expectedKind: ReferenceKind
): string {
  const item = record(reference, `${expectedKind} reference`);
  exactKeys(item, ["kind", "sha256", "fileName"], `${expectedKind} reference`);
  if (reference.kind !== expectedKind) {
    throw new ProxyLabPrivilegedAuthorityRefusal(`${expectedKind} reference kind is invalid`);
  }
  validHash(reference.sha256, `${expectedKind} reference hash`);
  const expectedFileName =
    expectedKind === "route-authority"
      ? "authority-v2.json"
      : expectedKind === "privileged-boundary"
        ? `${reference.sha256}.json`
        : expectedKind === "controller-public-key"
          ? `${reference.sha256}.pem`
          : `${reference.sha256}.sig`;
  if (reference.fileName !== expectedFileName || basename(reference.fileName) !== reference.fileName) {
    throw new ProxyLabPrivilegedAuthorityRefusal(`${expectedKind} reference is not exact and content-addressed`);
  }
  const root = resolve(directory);
  const file = resolve(root, reference.fileName);
  if (dirname(file) !== root) {
    throw new ProxyLabPrivilegedAuthorityRefusal(`${expectedKind} reference escaped its bundle`);
  }
  return file;
}

function validateAuthority(value: unknown): ProxyLabPrivilegedAuthorityV2 {
  const authority = record(value, "privileged authority");
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
      "privilegedSignerId",
      "routeAuthoritySha256",
      "routeAuthorityVerifiedAt",
      "firewallRulesetSha256",
      "firewallControllerIdentitySha256",
      "observerConfigurationSha256",
      "observerPacketEvidenceSha256",
      "beforeStateSha256",
      "afterStateSha256",
      "cleanupAttestationSha256",
      "killSwitchProofSha256",
      "attestations",
      "hmacSha256",
    ],
    "privileged authority"
  );
  if (
    authority.schemaVersion !== 2 ||
    authority.kind !== "provider-free-synthetic-proxy-lab-privileged-authority" ||
    authority.scope !== "provider-free-synthetic-proxy-lab" ||
    authority.executionAuthorized !== false ||
    authority.realCandidateInvocations !== 0 ||
    authority.providerCalls !== 0
  ) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged authority is not structurally synthetic-only");
  }
  if (typeof authority.runId !== "string" || !UUID.test(authority.runId)) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged authority runId is malformed");
  }
  validHash(authority.runNonce, "privileged authority runNonce");
  validateTimes(authority.issuedAt, authority.expiresAt);
  if (
    authority.signerId !== "ef-proxy-lab-local-hmac-v2" ||
    authority.privilegedSignerId !== "ef-privileged-wsl-root-rsa-v1"
  ) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged authority signer boundary is missing");
  }
  for (const name of [
    "routeAuthoritySha256",
    "firewallRulesetSha256",
    "firewallControllerIdentitySha256",
    "observerConfigurationSha256",
    "observerPacketEvidenceSha256",
    "beforeStateSha256",
    "afterStateSha256",
    "cleanupAttestationSha256",
    "killSwitchProofSha256",
    "hmacSha256",
  ]) {
    validHash(authority[name], `privileged authority ${name}`);
  }
  if (typeof authority.routeAuthorityVerifiedAt !== "string" || !Number.isFinite(Date.parse(authority.routeAuthorityVerifiedAt))) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged authority route verification time is malformed");
  }
  const attestations = record(authority.attestations, "privileged authority attestations");
  exactKeys(
    attestations,
    ["routeAuthority", "privilegedBoundary", "controllerPublicKey", "controllerSignature"],
    "privileged authority attestations"
  );
  return authority as ProxyLabPrivilegedAuthorityV2;
}

async function parseJson(file: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new ProxyLabPrivilegedAuthorityRefusal(`${label} is missing or malformed`);
  }
}

export async function createProxyLabPrivilegedApprovalBundle({
  directory,
  routeAuthorityFile,
  payload: payloadInput,
  controllerPublicKeyPem,
  controllerSignature,
  authoritySigningKey,
}: {
  directory: string;
  routeAuthorityFile: string;
  payload: ProxyLabPrivilegedBoundaryPayloadV2;
  controllerPublicKeyPem: string;
  controllerSignature: Buffer;
  authoritySigningKey: Buffer;
}): Promise<{
  authority: ProxyLabPrivilegedAuthorityV2;
  authorityFile: string;
  payloadFile: string;
  controllerPublicKeyFile: string;
  controllerSignatureFile: string;
}> {
  if (authoritySigningKey.byteLength < 32) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged authority signing key is too short");
  }
  const payload = validatePayload(payloadInput);
  const root = resolve(directory);
  const exactRouteAuthorityFile = resolve(routeAuthorityFile);
  if (dirname(exactRouteAuthorityFile) !== root || basename(exactRouteAuthorityFile) !== "authority-v2.json") {
    throw new ProxyLabPrivilegedAuthorityRefusal("route authority escaped the privileged bundle");
  }
  const routeAuthorityBytes = await readFile(exactRouteAuthorityFile).catch(() => {
    throw new ProxyLabPrivilegedAuthorityRefusal("route authority is missing");
  });
  const routeAuthoritySha256 = sha256(routeAuthorityBytes);
  if (routeAuthoritySha256 !== payload.routeAuthoritySha256) {
    throw new ProxyLabPrivilegedAuthorityRefusal("route authority hash is unbound from privileged proof");
  }
  const payloadJson = proxyLabCanonicalJson(payload);
  let publicKey;
  try {
    publicKey = createPublicKey(controllerPublicKeyPem);
  } catch {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged controller public key is malformed");
  }
  if (!verifySignature("sha256", Buffer.from(payloadJson), publicKey, controllerSignature)) {
    throw new ProxyLabPrivilegedAuthorityRefusal("independent privileged controller signature is invalid");
  }

  const payloadSha256 = sha256(payloadJson);
  const publicKeySha256 = sha256(controllerPublicKeyPem);
  const signatureSha256 = sha256(controllerSignature);
  const payloadFile = resolve(root, `${payloadSha256}.json`);
  const controllerPublicKeyFile = resolve(root, `${publicKeySha256}.pem`);
  const controllerSignatureFile = resolve(root, `${signatureSha256}.sig`);
  const authorityFile = resolve(root, "privileged-authority-v2.json");
  for (const file of [payloadFile, controllerPublicKeyFile, controllerSignatureFile, authorityFile]) {
    if (dirname(file) !== root) throw new ProxyLabPrivilegedAuthorityRefusal("privileged bundle path escaped its root");
  }
  const unsigned: Omit<ProxyLabPrivilegedAuthorityV2, "hmacSha256"> = {
    schemaVersion: 2,
    kind: "provider-free-synthetic-proxy-lab-privileged-authority",
    scope: "provider-free-synthetic-proxy-lab",
    executionAuthorized: false,
    realCandidateInvocations: 0,
    providerCalls: 0,
    runId: payload.runId,
    runNonce: payload.runNonce,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    signerId: "ef-proxy-lab-local-hmac-v2",
    privilegedSignerId: "ef-privileged-wsl-root-rsa-v1",
    routeAuthoritySha256,
    routeAuthorityVerifiedAt: payload.routeAuthorityVerifiedAt,
    firewallRulesetSha256: payload.firewall.rulesetSha256,
    firewallControllerIdentitySha256: payload.firewall.controllerIdentitySha256,
    observerConfigurationSha256: payload.observer.configurationSha256,
    observerPacketEvidenceSha256: payload.observer.packetEvidenceSha256,
    beforeStateSha256: payload.state.beforeSha256,
    afterStateSha256: payload.state.afterSha256,
    cleanupAttestationSha256: payload.cleanup.attestationSha256,
    killSwitchProofSha256: payload.killSwitch.proofSha256,
    attestations: {
      routeAuthority: {
        kind: "route-authority",
        sha256: routeAuthoritySha256,
        fileName: "authority-v2.json",
      },
      privilegedBoundary: {
        kind: "privileged-boundary",
        sha256: payloadSha256,
        fileName: `${payloadSha256}.json`,
      },
      controllerPublicKey: {
        kind: "controller-public-key",
        sha256: publicKeySha256,
        fileName: `${publicKeySha256}.pem`,
      },
      controllerSignature: {
        kind: "controller-signature",
        sha256: signatureSha256,
        fileName: `${signatureSha256}.sig`,
      },
    },
  };
  const authority: ProxyLabPrivilegedAuthorityV2 = {
    ...unsigned,
    hmacSha256: hmac(unsigned, authoritySigningKey),
  };
  await writeFile(payloadFile, payloadJson, { encoding: "utf8", flag: "wx" });
  await writeFile(controllerPublicKeyFile, controllerPublicKeyPem, { encoding: "utf8", flag: "wx" });
  await writeFile(controllerSignatureFile, controllerSignature, { flag: "wx" });
  await writeFile(authorityFile, proxyLabCanonicalJson(authority), { encoding: "utf8", flag: "wx" });
  return { authority, authorityFile, payloadFile, controllerPublicKeyFile, controllerSignatureFile };
}

export async function verifyProxyLabPrivilegedApprovalBundle({
  directory,
  authorityFile,
  authoritySigningKey,
  now,
  routeReplayLedger,
  privilegedReplayLedger,
}: {
  directory: string;
  authorityFile: string;
  authoritySigningKey: Buffer;
  now: Date;
  routeReplayLedger: Set<string>;
  privilegedReplayLedger: Set<string>;
}): Promise<{
  status: "SYNTHETIC_PRIVILEGED_PROXY_LAB_APPROVED";
  scope: "provider-free-synthetic-proxy-lab";
  executionAuthorized: false;
  realCandidateInvocations: 0;
  providerCalls: 0;
  runId: string;
  runNonce: string;
  routeId: string;
  firewallRulesetSha256: string;
  observerPacketEvidenceSha256: string;
}> {
  if (authoritySigningKey.byteLength < 32) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged authority signing key is too short");
  }
  const root = resolve(directory);
  const exactAuthorityFile = resolve(authorityFile);
  if (dirname(exactAuthorityFile) !== root || basename(exactAuthorityFile) !== "privileged-authority-v2.json") {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged authority escaped its exact bundle path");
  }
  const authority = validateAuthority(await parseJson(exactAuthorityFile, "privileged authority"));
  const expectedHmac = hmac(unsignedAuthority(authority), authoritySigningKey);
  if (!timingSafeEqual(Buffer.from(authority.hmacSha256, "hex"), Buffer.from(expectedHmac, "hex"))) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged authority HMAC is invalid");
  }
  const { issuedAt, expiresAt } = validateTimes(authority.issuedAt, authority.expiresAt);
  if (now.getTime() < issuedAt) throw new ProxyLabPrivilegedAuthorityRefusal("privileged authority is not yet valid");
  if (now.getTime() >= expiresAt) throw new ProxyLabPrivilegedAuthorityRefusal("privileged authority is expired");
  if (privilegedReplayLedger.has(authority.runNonce)) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged run nonce has already been consumed");
  }

  const routeAuthorityFile = safeReferencePath(root, authority.attestations.routeAuthority, "route-authority");
  const payloadFile = safeReferencePath(root, authority.attestations.privilegedBoundary, "privileged-boundary");
  const publicKeyFile = safeReferencePath(root, authority.attestations.controllerPublicKey, "controller-public-key");
  const signatureFile = safeReferencePath(root, authority.attestations.controllerSignature, "controller-signature");
  const [routeAuthorityBytes, payloadBytes, publicKeyBytes, signatureBytes] = await Promise.all([
    readFile(routeAuthorityFile),
    readFile(payloadFile),
    readFile(publicKeyFile),
    readFile(signatureFile),
  ]).catch(() => {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged attestation is missing or unresolvable");
  });
  if (
    sha256(routeAuthorityBytes) !== authority.attestations.routeAuthority.sha256 ||
    sha256(routeAuthorityBytes) !== authority.routeAuthoritySha256
  ) {
    throw new ProxyLabPrivilegedAuthorityRefusal("route authority attestation hash mismatch");
  }
  if (sha256(payloadBytes) !== authority.attestations.privilegedBoundary.sha256) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged boundary attestation hash mismatch");
  }
  if (sha256(publicKeyBytes) !== authority.attestations.controllerPublicKey.sha256) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged controller public key hash mismatch");
  }
  if (sha256(signatureBytes) !== authority.attestations.controllerSignature.sha256) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged controller signature hash mismatch");
  }
  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged boundary attestation is malformed");
  }
  if (proxyLabCanonicalJson(payloadRaw) !== payloadBytes.toString("utf8")) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged boundary attestation is not canonical");
  }
  const payload = validatePayload(payloadRaw);
  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyBytes);
  } catch {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged controller public key is malformed");
  }
  if (!verifySignature("sha256", payloadBytes, publicKey, signatureBytes)) {
    throw new ProxyLabPrivilegedAuthorityRefusal("independent privileged controller signature is invalid");
  }
  if (
    payload.runId !== authority.runId ||
    payload.runNonce !== authority.runNonce ||
    payload.issuedAt !== authority.issuedAt ||
    payload.expiresAt !== authority.expiresAt ||
    payload.routeAuthoritySha256 !== authority.routeAuthoritySha256 ||
    payload.routeAuthorityVerifiedAt !== authority.routeAuthorityVerifiedAt ||
    payload.firewall.rulesetSha256 !== authority.firewallRulesetSha256 ||
    payload.firewall.controllerIdentitySha256 !== authority.firewallControllerIdentitySha256 ||
    payload.observer.configurationSha256 !== authority.observerConfigurationSha256 ||
    payload.observer.packetEvidenceSha256 !== authority.observerPacketEvidenceSha256 ||
    payload.state.beforeSha256 !== authority.beforeStateSha256 ||
    payload.state.afterSha256 !== authority.afterStateSha256 ||
    payload.cleanup.attestationSha256 !== authority.cleanupAttestationSha256 ||
    payload.killSwitch.proofSha256 !== authority.killSwitchProofSha256
  ) {
    throw new ProxyLabPrivilegedAuthorityRefusal("privileged authority evidence hash binding mismatch");
  }

  const route = await verifyProxyLabAuthorityBundle({
    directory: root,
    authorityFile: routeAuthorityFile,
    signingKey: authoritySigningKey,
    now: new Date(authority.routeAuthorityVerifiedAt),
    replayLedger: routeReplayLedger,
  });
  privilegedReplayLedger.add(authority.runNonce);
  return {
    status: "SYNTHETIC_PRIVILEGED_PROXY_LAB_APPROVED",
    scope: "provider-free-synthetic-proxy-lab",
    executionAuthorized: false,
    realCandidateInvocations: 0,
    providerCalls: 0,
    runId: authority.runId,
    runNonce: authority.runNonce,
    routeId: route.routeId,
    firewallRulesetSha256: authority.firewallRulesetSha256,
    observerPacketEvidenceSha256: authority.observerPacketEvidenceSha256,
  };
}
