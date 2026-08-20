import { resolve } from "node:path";

import { DEV_BENCH_V1 } from "../src/lib/engineering-factory/catalog";
import {
  DRY_RUN_TRIAL_MANIFEST_LOCAL_DIRECTORY,
  preflightApprovedDryRunTrialManifest,
} from "../src/lib/engineering-factory/trial-manifest-v2";

const requestedFile = process.argv[2];
const file = requestedFile
  ? resolve(requestedFile)
  : resolve(DRY_RUN_TRIAL_MANIFEST_LOCAL_DIRECTORY, "dry-run-trial-config.json");

async function main() {
  try {
    const { plan } = await preflightApprovedDryRunTrialManifest({ file, catalog: DEV_BENCH_V1 });
    console.log(
      JSON.stringify(
        {
          status: "DRY_RUN_PREFLIGHT_READY",
          costComparison: plan.costComparison,
          caseSeeds: plan.caseSeeds,
          casePacketFingerprints: plan.casePacketFingerprints,
          schedule: plan.schedule,
          interventionRule: plan.interventionRule,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(`Dry-run trial preflight refused: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}

void main();
