import { resolve } from "node:path";

import {
  CANDIDATE_EXECUTION_AUTHORITY_LOCAL_DIRECTORY,
  preflightCandidateExecutionAuthority,
} from "../src/lib/engineering-factory/candidate-execution-readiness";
import { DEV_BENCH_V1 } from "../src/lib/engineering-factory/catalog";
import {
  DRY_RUN_TRIAL_MANIFEST_LOCAL_DIRECTORY,
  preflightApprovedDryRunTrialManifest,
} from "../src/lib/engineering-factory/trial-manifest-v2";

const requestedTrialManifest = process.argv[2];
const requestedAuthority = process.argv[3];
const trialManifest = requestedTrialManifest
  ? resolve(requestedTrialManifest)
  : resolve(DRY_RUN_TRIAL_MANIFEST_LOCAL_DIRECTORY, "dry-run-trial-config.json");
const authorityFile = requestedAuthority
  ? resolve(requestedAuthority)
  : resolve(CANDIDATE_EXECUTION_AUTHORITY_LOCAL_DIRECTORY, "candidate-execution-authority.json");

async function main() {
  try {
    const { plan } = await preflightApprovedDryRunTrialManifest({
      file: trialManifest,
      catalog: DEV_BENCH_V1,
    });
    const report = await preflightCandidateExecutionAuthority({ plan, file: authorityFile });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(
      `Candidate execution preflight refused: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
    process.exitCode = 1;
  }
}

void main();
