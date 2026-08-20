import { resolve } from "node:path";

import {
  CANDIDATE_EXECUTION_AUTHORITY_LOCAL_DIRECTORY,
  writeCandidateExecutionAuthorityTemplate,
} from "../src/lib/engineering-factory/candidate-execution-readiness";
import { DEV_BENCH_V1 } from "../src/lib/engineering-factory/catalog";
import {
  DRY_RUN_TRIAL_MANIFEST_LOCAL_DIRECTORY,
  preflightApprovedDryRunTrialManifest,
} from "../src/lib/engineering-factory/trial-manifest-v2";

const requestedTrialManifest = process.argv[2];
const requestedDirectory = process.argv[3];
const trialManifest = requestedTrialManifest
  ? resolve(requestedTrialManifest)
  : resolve(DRY_RUN_TRIAL_MANIFEST_LOCAL_DIRECTORY, "dry-run-trial-config.json");
const directory = requestedDirectory
  ? resolve(requestedDirectory)
  : resolve(CANDIDATE_EXECUTION_AUTHORITY_LOCAL_DIRECTORY);

async function main() {
  try {
    const { plan } = await preflightApprovedDryRunTrialManifest({
      file: trialManifest,
      catalog: DEV_BENCH_V1,
    });
    const file = await writeCandidateExecutionAuthorityTemplate({ plan, directory });
    console.log(JSON.stringify({ status: "CANDIDATE_EXECUTION_AUTHORITY_DRAFT_CREATED", file }, null, 2));
  } catch (error) {
    console.error(
      `Candidate execution authority template refused: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
    process.exitCode = 1;
  }
}

void main();
