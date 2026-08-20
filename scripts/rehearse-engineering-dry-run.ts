import { resolve } from "node:path";

import { DEV_BENCH_V1 } from "../src/lib/engineering-factory/catalog";
import {
  DRY_RUN_EXECUTOR_SCRATCH_DIRECTORY,
  rehearseDryRunExecutor,
} from "../src/lib/engineering-factory/dry-run-executor";
import {
  DRY_RUN_TRIAL_MANIFEST_LOCAL_DIRECTORY,
  preflightApprovedDryRunTrialManifest,
} from "../src/lib/engineering-factory/trial-manifest-v2";

const requestedManifest = process.argv[2];
const requestedSlots = process.argv[3];
const manifest = requestedManifest
  ? resolve(requestedManifest)
  : resolve(DRY_RUN_TRIAL_MANIFEST_LOCAL_DIRECTORY, "dry-run-trial-config.json");
const maxSlots = requestedSlots === undefined ? undefined : Number(requestedSlots);

async function main() {
  try {
    const { plan } = await preflightApprovedDryRunTrialManifest({ file: manifest, catalog: DEV_BENCH_V1 });
    const rehearsals = await rehearseDryRunExecutor({
      plan,
      catalog: DEV_BENCH_V1,
      repositoryDirectory: process.cwd(),
      scratchDirectory: resolve(DRY_RUN_EXECUTOR_SCRATCH_DIRECTORY),
      maxSlots,
    });
    console.log(
      JSON.stringify(
        {
          status: "DRY_RUN_EXECUTOR_REHEARSAL_COMPLETE",
          candidateInvocations: 0,
          providerCalls: 0,
          slotsRehearsed: rehearsals.length,
          rehearsals,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(`Dry-run executor rehearsal refused: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}

void main();
