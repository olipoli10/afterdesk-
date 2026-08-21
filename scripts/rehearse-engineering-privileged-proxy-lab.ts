import { resolve } from "node:path";

import { runPrivilegedProviderFreeProxyLab } from "../tools/engineering-factory/proxy-lab/privileged-proxy-lab-runner";

async function main(): Promise<void> {
  const evidenceDirectory = resolve(process.argv[2] ?? ".scratch/engineering-factory/privileged-proxy-lab");
  const evidence = await runPrivilegedProviderFreeProxyLab({ evidenceDirectory });
  process.stdout.write(
    `Privileged provider-free proxy lab completed locally: ${evidence.evidenceFile}; verdict: ${evidence.verdict}; real candidates: ${evidence.realCandidateInvocations}; provider calls: ${evidence.providerCalls}; execution authorized: ${evidence.executionAuthorized}.\n`
  );
}

void main();
