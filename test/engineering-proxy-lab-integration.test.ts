import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  runProviderFreeProxyLab,
  type ProviderFreeProxyLabEvidence,
} from "../tools/engineering-factory/proxy-lab/proxy-lab-runner";

describe("Engineering Factory provider-free proxy lab", () => {
  it(
    "proves the largest safe rootless proxy-only boundary and remains NO-GO without a root-owned firewall",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "ef-proxy-lab-evidence-"));
      try {
        const result = await runProviderFreeProxyLab({ evidenceDirectory: directory });
        expect(result).toMatchObject<Partial<ProviderFreeProxyLabEvidence>>({
          schemaVersion: 1,
          status: "PROVIDER_FREE_PROXY_LAB_PROVED_WITH_PRIVILEGED_GAP",
          verdict: "NO_GO_ROOT_OWNED_FIREWALL_PROOF_MISSING",
          executionAuthorized: false,
          realCandidateInvocations: 0,
          providerCalls: 0,
          fakeProviderOperations: 6,
          authorityV2Verified: true,
          candidateNetworkInternal: true,
          candidateNetworkDnsDisabled: true,
          candidateNetworkNoDefaultRoute: true,
          candidateIpv6Disabled: true,
          credentialBoundaryProved: true,
          contentFreeAuditVerified: true,
          cleanupVerified: true,
          rootOwnedFirewallProved: false,
        });
        expect(Object.values(result.hostileCandidate)).toEqual(expect.arrayContaining([true]));
        expect(Object.values(result.hostileCandidate).every(Boolean)).toBe(true);
        expect(result.adversarialScenarios.every((scenario) => scenario.refused)).toBe(true);
        expect(result.adversarialScenarios.map((scenario) => scenario.name)).toEqual(
          expect.arrayContaining([
            "dns-rebind",
            "dns-multi-private",
            "dns-cname",
            "dns-ttl-zero",
            "dns-aaaa",
            "dns-ipv4-mapped-ipv6",
            "dns-nat64-metadata",
            "tls-wrong-san",
            "tls-untrusted-ca",
            "tls-expired",
            "http-redirect",
            "response-oversize",
            "response-slow",
            "credential-reflection",
            "hostile-error-body",
          ])
        );
        const persisted = await readFile(result.evidenceFile, "utf8");
        expect(persisted).not.toMatch(/EF_FAKE_CANARY|EF_RAW_STDERR_CANARY|candidate-controlled|candidate-cookie|candidate-api-key/);
        expect(persisted).not.toMatch(/Authorization|Proxy-Authorization|Cookie|X-Api-Key/i);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    600_000
  );

  it("contains no real model/provider launcher or provider endpoint", async () => {
    const root = join(process.cwd(), "tools", "engineering-factory", "proxy-lab");
    const source = (
      await Promise.all(
        ["fake-dns.py", "fake-provider.py", "relay.py", "hostile-candidate.py", "proxy-lab-runner.ts"].map((file) =>
          readFile(join(root, file), "utf8")
        )
      )
    ).join("\n");
    expect(source).not.toMatch(/codex\s+exec|claude\s+-p|api\.openai\.com|api\.anthropic\.com/i);
    expect(source).not.toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY/);
  });
});
