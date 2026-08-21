import { runProviderFreeProxyLab } from "../tools/engineering-factory/proxy-lab/proxy-lab-runner";

async function main(): Promise<void> {
  const evidence = await runProviderFreeProxyLab({
    evidenceDirectory: ".scratch/engineering-factory/proxy-lab",
  });
  process.stdout.write(
    `Provider-free proxy lab completed locally: ${evidence.evidenceFile}; verdict: ${evidence.verdict}; real candidates: ${evidence.realCandidateInvocations}; provider calls: ${evidence.providerCalls}; execution authorized: ${evidence.executionAuthorized}.\n`
  );
}

void main();
