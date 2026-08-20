import {
  persistSyntheticIsolationEvidence,
  runSyntheticIsolationTrial,
} from "../tools/engineering-factory/synthetic-runner/synthetic-runner";

async function main(): Promise<void> {
  const evidence = await runSyntheticIsolationTrial({
    input: "ENDVERA_PROVIDER_FREE_SYNTHETIC_INPUT_V1",
  });

  const file = await persistSyntheticIsolationEvidence({
    evidence,
    directory: ".scratch/engineering-factory/synthetic-isolation",
  });

  console.log(
    `Synthetic isolation proof recorded locally: ${file}; real candidates: ${evidence.realCandidateInvocations}; provider calls: ${evidence.providerCalls}.`
  );
}

void main();
