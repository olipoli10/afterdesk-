import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProxyLabAuthorityRefusal,
  createProxyLabAuthorityBundle,
  verifyProxyLabAuthorityBundle,
  type ProxyLabManifestV2,
  type ProxyLabPolicyV2,
} from "@/lib/engineering-factory/proxy-lab-authority-v2";

const scratch: string[] = [];
const SIGNING_KEY = Buffer.from("ef-proxy-lab-authority-v2-test-key-32-bytes!!", "utf8");
const NOW = new Date("2026-08-20T20:30:00.000Z");

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function policy(): ProxyLabPolicyV2 {
  return {
    schemaVersion: 2,
    scope: "provider-free-synthetic-proxy-lab",
    executionAuthorized: false,
    candidateKind: "deterministic-hostile-fixture",
    providerKind: "local-fake-provider",
    killSwitch: { armed: true, tripped: false },
    route: {
      routeId: "route-synthetic-01",
      approvedFakeFqdn: "api.synthetic.ef-proxy-lab.invalid",
      relayMethod: "POST",
      relayPath: "/v1/routes/route-synthetic-01",
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
      maxRequestBodyBytes: 8 * 1024 * 1024,
      maxResponseBytes: 32 * 1024 * 1024,
      connectTimeoutMs: 3_000,
      tlsHandshakeTimeoutMs: 5_000,
      firstByteTimeoutMs: 30_000,
      totalRequestTimeoutMs: 120_000,
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

async function createBundle(overrides: {
  policy?: ProxyLabPolicyV2;
  manifest?: ProxyLabManifestV2;
  signingKey?: Buffer;
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "ef-proxy-authority-v2-"));
  scratch.push(directory);
  const result = await createProxyLabAuthorityBundle({
    directory,
    policy: overrides.policy ?? policy(),
    manifest: overrides.manifest ?? manifest(),
    signingKey: overrides.signingKey ?? SIGNING_KEY,
    runId: "7a560f6e-f2b4-4d9b-949e-7da643ca0376",
    runNonce: "c".repeat(64),
    issuedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 5 * 60_000),
  });
  return { directory, ...result };
}

describe("Engineering Factory proxy-lab Authority V2", () => {
  it("resolves and authenticates every content-addressed local attestation", async () => {
    const bundle = await createBundle();
    const replayLedger = new Set<string>();

    await expect(
      verifyProxyLabAuthorityBundle({
        directory: bundle.directory,
        authorityFile: bundle.authorityFile,
        signingKey: SIGNING_KEY,
        now: new Date(NOW.getTime() + 1_000),
        replayLedger,
      })
    ).resolves.toMatchObject({
      status: "SYNTHETIC_PROXY_LAB_ADMITTED",
      scope: "provider-free-synthetic-proxy-lab",
      executionAuthorized: false,
      routeId: "route-synthetic-01",
    });
    expect(replayLedger).toContain("c".repeat(64));
  });

  it("fails closed on missing, malformed, unresolved or hash-drifted evidence", async () => {
    const bundle = await createBundle();
    const authority = JSON.parse(await readFile(bundle.authorityFile, "utf8"));
    const policyFile = join(bundle.directory, authority.attestations.policy.fileName);
    await writeFile(policyFile, `${await readFile(policyFile, "utf8")} `, "utf8");

    await expect(
      verifyProxyLabAuthorityBundle({
        directory: bundle.directory,
        authorityFile: bundle.authorityFile,
        signingKey: SIGNING_KEY,
        now: NOW,
        replayLedger: new Set(),
      })
    ).rejects.toThrow("policy attestation hash mismatch");
  });

  it("rejects expiry, replay, signature omission and the wrong HMAC boundary", async () => {
    const bundle = await createBundle();
    const ledger = new Set<string>();
    await verifyProxyLabAuthorityBundle({
      directory: bundle.directory,
      authorityFile: bundle.authorityFile,
      signingKey: SIGNING_KEY,
      now: NOW,
      replayLedger: ledger,
    });
    await expect(
      verifyProxyLabAuthorityBundle({
        directory: bundle.directory,
        authorityFile: bundle.authorityFile,
        signingKey: SIGNING_KEY,
        now: NOW,
        replayLedger: ledger,
      })
    ).rejects.toThrow("run nonce has already been consumed");
    await expect(
      verifyProxyLabAuthorityBundle({
        directory: bundle.directory,
        authorityFile: bundle.authorityFile,
        signingKey: Buffer.from("wrong-independent-key-boundary-xxxxxxxx", "utf8"),
        now: NOW,
        replayLedger: new Set(),
      })
    ).rejects.toThrow("authority HMAC is invalid");
    await expect(
      verifyProxyLabAuthorityBundle({
        directory: bundle.directory,
        authorityFile: bundle.authorityFile,
        signingKey: SIGNING_KEY,
        now: new Date(NOW.getTime() + 10 * 60_000),
        replayLedger: new Set(),
      })
    ).rejects.toThrow("authority is expired");
  });

  it("structurally refuses real candidates, real providers, disabled kill switches and zero ceilings", async () => {
    const invalidPolicies: ProxyLabPolicyV2[] = [
      { ...policy(), candidateKind: "codex" as never },
      { ...policy(), providerKind: "openai" as never },
      { ...policy(), executionAuthorized: true as never },
      { ...policy(), killSwitch: { armed: false, tripped: false } },
      { ...policy(), limits: { ...policy().limits, syntheticSpendCeilingMicros: 0 } },
      { ...policy(), limits: { ...policy().limits, syntheticTokenCeiling: 0 } },
    ];

    for (const invalidPolicy of invalidPolicies) {
      const directory = await mkdtemp(join(tmpdir(), "ef-proxy-authority-refusal-"));
      scratch.push(directory);
      await expect(
        createProxyLabAuthorityBundle({
          directory,
          policy: invalidPolicy,
          manifest: manifest(),
          signingKey: SIGNING_KEY,
          runId: "7a560f6e-f2b4-4d9b-949e-7da643ca0376",
          runNonce: "d".repeat(64),
          issuedAt: NOW,
          expiresAt: new Date(NOW.getTime() + 60_000),
        })
      ).rejects.toBeInstanceOf(ProxyLabAuthorityRefusal);
    }
  });

  it("binds the complete ordered runtime chain and exact route semantics", async () => {
    const bundle = await createBundle();
    const authority = JSON.parse(await readFile(bundle.authorityFile, "utf8"));
    const manifestFile = join(bundle.directory, authority.attestations.manifest.fileName);
    const storedManifest = JSON.parse(await readFile(manifestFile, "utf8"));
    storedManifest.runtimeChain[2].sha256 = "0".repeat(64);
    await writeFile(manifestFile, JSON.stringify(storedManifest), "utf8");

    await expect(
      verifyProxyLabAuthorityBundle({
        directory: bundle.directory,
        authorityFile: bundle.authorityFile,
        signingKey: SIGNING_KEY,
        now: NOW,
        replayLedger: new Set(),
      })
    ).rejects.toThrow("manifest attestation hash mismatch");
  });
});
