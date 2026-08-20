import {
  persistNativeIsolationEvidence,
  runNativeIsolationSyntheticTrial,
} from "../tools/engineering-factory/native-runner/native-runner";

async function main(): Promise<void> {
  const evidence = await runNativeIsolationSyntheticTrial({
    input: "ENDVERA_PROVIDER_FREE_NATIVE_SYNTHETIC_INPUT_V1",
  });
  const file = await persistNativeIsolationEvidence({
    evidence,
    directory: ".scratch/engineering-factory/native-isolation",
  });
  process.stdout.write(
    `Native synthetic controls proved locally: ${file}; real candidates: ${evidence.realCandidateInvocations}; provider calls: ${evidence.providerCalls}; authority: ${evidence.executionAuthority}.\n`
  );
}

void main();
