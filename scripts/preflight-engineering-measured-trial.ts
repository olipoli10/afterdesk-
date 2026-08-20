import { resolve } from "node:path";

import { DEV_BENCH_V1 } from "../src/lib/engineering-factory/catalog";
import {
  preflightApprovedTrialManifest,
  TRIAL_MANIFEST_LOCAL_DIRECTORY,
} from "../src/lib/engineering-factory/trial-manifest";

const requestedFile = process.argv[2];
const file = requestedFile
  ? resolve(requestedFile)
  : resolve(TRIAL_MANIFEST_LOCAL_DIRECTORY, "trial-config.json");

async function main() {
  try {
    const { plan } = await preflightApprovedTrialManifest({ file, catalog: DEV_BENCH_V1 });
    console.log(
      JSON.stringify(
        {
          status: "PREFLIGHT_READY",
          startingCommit: plan.startingCommit,
          packetFingerprint: plan.packetFingerprint,
          schedule: plan.schedule,
          interventionRule: plan.interventionRule,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(`Measured trial preflight refused: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}

void main();
