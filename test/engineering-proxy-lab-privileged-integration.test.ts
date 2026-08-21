import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runPrivilegedProviderFreeProxyLab } from "../tools/engineering-factory/proxy-lab/privileged-proxy-lab-runner";

const privileged = process.env.EF_RUN_PRIVILEGED_PROXY_LAB === "1" ? it : it.skip;

describe("Engineering Factory privileged provider-free Proxy Lab", () => {
  privileged(
    "proves the root-owned deny-by-default boundary and independent metadata observer",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "ef-privileged-proxy-lab-evidence-"));
      try {
        const result = await runPrivilegedProviderFreeProxyLab({ evidenceDirectory: directory });
        expect(result).toMatchObject({
          schemaVersion: 2,
          status: "PRIVILEGED_PROVIDER_FREE_PROXY_LAB_PROVED",
          verdict: "GO_NEXT_SYNTHETIC_MILESTONE_ONLY",
          executionAuthorized: false,
          realCandidateInvocations: 0,
          providerCalls: 0,
          privilegedApprovalVerified: true,
          rootOwnedFirewallProved: true,
          independentPacketObserverProved: true,
          beforeAfterStateMatched: true,
          cleanupVerified: true,
          killSwitchBlockBeforeTerminationProved: true,
          mutationCount: 18,
        });
        expect(result.beforeStateSha256).toBe(result.afterStateSha256);
        const persisted = await readFile(result.evidenceFile, "utf8");
        expect(persisted).not.toMatch(/EF_FAKE_CANARY|EF_RAW_STDERR_CANARY|candidate-controlled|candidate-cookie|candidate-api-key/);
        expect(persisted).not.toMatch(/Authorization|Proxy-Authorization|Cookie|X-Api-Key/i);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    900_000
  );
});
