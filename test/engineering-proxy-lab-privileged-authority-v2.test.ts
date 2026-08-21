import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PRIVILEGED_PROXY_LAB_MUTATIONS,
  ProxyLabPrivilegedAuthorityRefusal,
  createProxyLabPrivilegedApprovalBundle,
  verifyProxyLabPrivilegedApprovalBundle,
  type ProxyLabPrivilegedBoundaryPayloadV2,
} from "@/lib/engineering-factory/proxy-lab-privileged-authority-v2";
import {
  createProxyLabAuthorityBundle,
  proxyLabCanonicalJson,
  type ProxyLabManifestV2,
  type ProxyLabPolicyV2,
} from "@/lib/engineering-factory/proxy-lab-authority-v2";

const scratch: string[] = [];
const AUTHORITY_KEY = Buffer.from("ef-proxy-lab-privileged-authority-test-key-v2", "utf8");
const NOW = new Date("2026-08-20T23:00:00.000Z");
const ROUTE_RUN_ID = "7a560f6e-f2b4-4d9b-949e-7da643ca0376";
const PROOF_RUN_ID = "e26a7e8a-8aed-4e98-a36f-c098244c8b75";
const ROUTE_NONCE = "c".repeat(64);
const PROOF_NONCE = "d".repeat(64);

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function policy(): ProxyLabPolicyV2 {
  return {
    schemaVersion: 2,
    scope: "provider-free-synthetic-proxy-lab",
    executionAuthorized: false,
    candidateKind: "deterministic-hostile-fixture",
    providerKind: "local-fake-provider",
    killSwitch: { armed: true, tripped: false },
    route: {
      routeId: "route-privileged-main-0",
      approvedFakeFqdn: "api.synthetic.ef-proxy-lab.invalid",
      relayMethod: "POST",
      relayPath: "/v1/routes/route-privileged-main-0",
      upstreamScheme: "https",
      upstreamPort: 9443,
      upstreamMethod: "POST",
      upstreamPath: "/v1/fake",
      upstreamIpv4: "10.242.0.10",
      dnsIpv4: "10.242.0.53",
      dnsPort: 5353,
      tlsCaSha256: "a".repeat(64),
      redirects: 0,
    },
    limits: {
      concurrentConnections: 1,
      burstRequests: 2,
      sustainedRequestsPerSecond: 1,
      maxRequests: 30,
      maxHeaderBytes: 32 * 1024,
      maxRequestBodyBytes: 64 * 1024,
      maxResponseBytes: 64 * 1024,
      connectTimeoutMs: 1_000,
      tlsHandshakeTimeoutMs: 1_000,
      firstByteTimeoutMs: 1_000,
      totalRequestTimeoutMs: 3_000,
      syntheticSpendCeilingMicros: 1,
      syntheticTokenCeiling: 1,
    },
  };
}

function manifest(): ProxyLabManifestV2 {
  return {
    schemaVersion: 2,
    scope: "provider-free-synthetic-proxy-lab",
    executionAuthorized: false,
    artifactHashes: {
      hostileCandidateSha256: "1".repeat(64),
      relaySha256: "2".repeat(64),
      fakeDnsSha256: "3".repeat(64),
      fakeProviderSha256: "4".repeat(64),
    },
    runtimeChain: [
      { name: "wsl.exe", sha256: "5".repeat(64) },
      { name: "podman", sha256: "6".repeat(64) },
      { name: "crun", sha256: "7".repeat(64) },
      { name: "seccomp", sha256: "8".repeat(64) },
      { name: "kernel", sha256: "9".repeat(64) },
      { name: "image", sha256: "b".repeat(64) },
    ],
    topology: {
      candidateNetworkInternal: true,
      candidateNetworkDnsDisabled: true,
      candidateNetworkNoDefaultRoute: true,
      candidateIpv6Disabled: true,
      candidateHostsFileMinimal: true,
      candidateHttpProxyInheritanceDisabled: true,
      runtimePullPolicy: "never",
      candidateMounts: [],
    },
  };
}

function payload(routeAuthoritySha256: string): ProxyLabPrivilegedBoundaryPayloadV2 {
  const restoredHash = "e".repeat(64);
  return {
    schemaVersion: 2,
    kind: "provider-free-synthetic-privileged-boundary-proof",
    scope: "provider-free-synthetic-proxy-lab",
    executionAuthorized: false,
    realCandidateInvocations: 0,
    providerCalls: 0,
    runId: PROOF_RUN_ID,
    runNonce: PROOF_NONCE,
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    routeAuthoritySha256,
    routeAuthorityVerifiedAt: NOW.toISOString(),
    firewall: {
      ownerUid: 0,
      defaultDeny: true,
      candidateCanEdit: false,
      rulesetSha256: "1".repeat(64),
      controllerIdentitySha256: "2".repeat(64),
      controllerBinarySha256: "3".repeat(64),
      nftBinarySha256: "4".repeat(64),
      exactCandidateRelay: "10.241.0.2:8443",
      exactRelayDns: "10.242.0.53:5353",
      exactRelayProvider: "10.242.0.10:9443",
    },
    observer: {
      controlledOutsideRootlessRuntime: true,
      contentCaptureEnabled: false,
      configurationSha256: "5".repeat(64),
      binarySha256: "6".repeat(64),
      runtimeSha256: "7".repeat(64),
      packetEvidenceSha256: "8".repeat(64),
    },
    state: {
      beforeSha256: restoredHash,
      afterSha256: restoredHash,
      driftDetected: false,
    },
    cleanup: {
      attestationSha256: "9".repeat(64),
      verified: true,
      rulesLeak: false,
      observerProcessLeak: false,
      namespaceLeak: false,
      networkLeak: false,
      secretLeak: false,
    },
    killSwitch: {
      proofSha256: "a".repeat(64),
      blockedBeforeTermination: true,
      candidateAliveAfterBlock: true,
      successfulPacketsAfterBlock: 0,
      dropCounterDelta: 3,
    },
    mutations: PRIVILEGED_PROXY_LAB_MUTATIONS.map((name) => ({
      name,
      gate: name,
      status: "caught-and-byte-restored" as const,
      sourceBeforeSha256: "f".repeat(64),
      sourceAfterSha256: "f".repeat(64),
    })),
  };
}

async function createValidBundle() {
  const directory = await mkdtemp(join(tmpdir(), "ef-proxy-privileged-authority-v2-"));
  scratch.push(directory);
  const route = await createProxyLabAuthorityBundle({
    directory,
    policy: policy(),
    manifest: manifest(),
    signingKey: AUTHORITY_KEY,
    runId: ROUTE_RUN_ID,
    runNonce: ROUTE_NONCE,
    issuedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 5 * 60_000),
  });
  const routeBytes = await readFile(route.authorityFile);
  const proof = payload(hash(routeBytes));
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const signature = sign("sha256", Buffer.from(proxyLabCanonicalJson(proof)), privateKey);
  const approval = await createProxyLabPrivilegedApprovalBundle({
    directory,
    routeAuthorityFile: route.authorityFile,
    payload: proof,
    controllerPublicKeyPem: publicKeyPem,
    controllerSignature: signature,
    authoritySigningKey: AUTHORITY_KEY,
  });
  return { directory, route, proof, approval };
}

describe("Engineering Factory privileged Proxy Lab Authority V2", () => {
  it("resolves the route authority and independently signed privileged evidence", async () => {
    const bundle = await createValidBundle();
    await expect(
      verifyProxyLabPrivilegedApprovalBundle({
        directory: bundle.directory,
        authorityFile: bundle.approval.authorityFile,
        authoritySigningKey: AUTHORITY_KEY,
        now: new Date(NOW.getTime() + 1_000),
        routeReplayLedger: new Set(),
        privilegedReplayLedger: new Set(),
      })
    ).resolves.toMatchObject({
      status: "SYNTHETIC_PRIVILEGED_PROXY_LAB_APPROVED",
      executionAuthorized: false,
      realCandidateInvocations: 0,
      providerCalls: 0,
      runId: PROOF_RUN_ID,
      firewallRulesetSha256: "1".repeat(64),
      observerPacketEvidenceSha256: "8".repeat(64),
    });
  });

  it("rejects omitted, unsigned, hash-mismatched, stale and replayed proof", async () => {
    const bundle = await createValidBundle();
    const ledger = new Set<string>();
    await verifyProxyLabPrivilegedApprovalBundle({
      directory: bundle.directory,
      authorityFile: bundle.approval.authorityFile,
      authoritySigningKey: AUTHORITY_KEY,
      now: NOW,
      routeReplayLedger: new Set(),
      privilegedReplayLedger: ledger,
    });
    await expect(
      verifyProxyLabPrivilegedApprovalBundle({
        directory: bundle.directory,
        authorityFile: bundle.approval.authorityFile,
        authoritySigningKey: AUTHORITY_KEY,
        now: NOW,
        routeReplayLedger: new Set(),
        privilegedReplayLedger: ledger,
      })
    ).rejects.toThrow("privileged run nonce has already been consumed");

    const authority = JSON.parse(await readFile(bundle.approval.authorityFile, "utf8"));
    const evidenceFile = join(bundle.directory, authority.attestations.privilegedBoundary.fileName);
    await writeFile(evidenceFile, `${await readFile(evidenceFile, "utf8")} `, "utf8");
    await expect(
      verifyProxyLabPrivilegedApprovalBundle({
        directory: bundle.directory,
        authorityFile: bundle.approval.authorityFile,
        authoritySigningKey: AUTHORITY_KEY,
        now: NOW,
        routeReplayLedger: new Set(),
        privilegedReplayLedger: new Set(),
      })
    ).rejects.toThrow("privileged boundary attestation hash mismatch");
  });

  it("rejects unsafe, drifted, leaky or synthetic-only evidence presented as real authority", async () => {
    const routeDirectory = await mkdtemp(join(tmpdir(), "ef-proxy-privileged-refusal-"));
    scratch.push(routeDirectory);
    const route = await createProxyLabAuthorityBundle({
      directory: routeDirectory,
      policy: policy(),
      manifest: manifest(),
      signingKey: AUTHORITY_KEY,
      runId: ROUTE_RUN_ID,
      runNonce: ROUTE_NONCE,
      issuedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    const routeHash = hash(await readFile(route.authorityFile));
    const valid = payload(routeHash);
    const invalid: ProxyLabPrivilegedBoundaryPayloadV2[] = [
      { ...valid, executionAuthorized: true as never },
      { ...valid, realCandidateInvocations: 1 as never },
      { ...valid, providerCalls: 1 as never },
      { ...valid, firewall: { ...valid.firewall, defaultDeny: false as never } },
      { ...valid, firewall: { ...valid.firewall, candidateCanEdit: true as never } },
      { ...valid, observer: { ...valid.observer, controlledOutsideRootlessRuntime: false as never } },
      { ...valid, observer: { ...valid.observer, contentCaptureEnabled: true as never } },
      { ...valid, state: { ...valid.state, afterSha256: "0".repeat(64), driftDetected: true as never } },
      { ...valid, cleanup: { ...valid.cleanup, observerProcessLeak: true as never } },
      { ...valid, killSwitch: { ...valid.killSwitch, blockedBeforeTermination: false as never } },
    ];

    for (const proof of invalid) {
      const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
      const signature = sign("sha256", Buffer.from(proxyLabCanonicalJson(proof)), privateKey);
      await expect(
        createProxyLabPrivilegedApprovalBundle({
          directory: routeDirectory,
          routeAuthorityFile: route.authorityFile,
          payload: proof,
          controllerPublicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
          controllerSignature: signature,
          authoritySigningKey: AUTHORITY_KEY,
        })
      ).rejects.toBeInstanceOf(ProxyLabPrivilegedAuthorityRefusal);
    }
  });

  it("requires the complete exact mutation catalog and byte-exact restoration", async () => {
    const bundle = await createValidBundle();
    expect(bundle.proof.mutations.map((item) => item.name)).toEqual(PRIVILEGED_PROXY_LAB_MUTATIONS);
    const missing = { ...bundle.proof, mutations: bundle.proof.mutations.slice(1) };
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await expect(
      createProxyLabPrivilegedApprovalBundle({
        directory: bundle.directory,
        routeAuthorityFile: bundle.route.authorityFile,
        payload: missing,
        controllerPublicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
        controllerSignature: sign("sha256", Buffer.from(proxyLabCanonicalJson(missing)), privateKey),
        authoritySigningKey: AUTHORITY_KEY,
      })
    ).rejects.toThrow("privileged mutation catalog is incomplete or reordered");
  });

  it("does not accept a signature made by a different controller key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ef-proxy-privileged-signature-"));
    scratch.push(directory);
    const route = await createProxyLabAuthorityBundle({
      directory,
      policy: policy(),
      manifest: manifest(),
      signingKey: AUTHORITY_KEY,
      runId: ROUTE_RUN_ID,
      runNonce: ROUTE_NONCE,
      issuedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    const proof = payload(hash(await readFile(route.authorityFile)));
    const signer = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const signature = sign("sha256", Buffer.from(proxyLabCanonicalJson(proof)), signer.privateKey);
    await expect(
      createProxyLabPrivilegedApprovalBundle({
        directory,
        routeAuthorityFile: route.authorityFile,
        payload: proof,
        controllerPublicKeyPem: other.publicKey.export({ format: "pem", type: "spki" }).toString(),
        controllerSignature: signature,
        authoritySigningKey: randomBytes(32),
      })
    ).rejects.toThrow("independent privileged controller signature is invalid");
  });
});
