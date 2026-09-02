import "server-only";

import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  assertInternalE2ECheckpointOrder,
  assertInternalE2EReportSanitized,
  internalE2ECheckpointSchema,
  internalE2EReportSchema,
  INTERNAL_E2E_CHECKPOINT_CODES,
  INTERNAL_E2E_SCENARIO_KEY,
  INTERNAL_E2E_SCENARIO_VERSION,
  type InternalE2ECheckpoint,
  type InternalE2ECheckpointCode,
  type InternalE2EObserved,
} from "@/lib/construction-operating-assistant-r36/contracts";
import { INTERNAL_E2E_SCENARIO_HASH } from "@/lib/construction-operating-assistant-r36/scenario";

type StepResult = {
  observed: InternalE2EObserved;
  canonicalState: unknown;
  externalEffectCount: 0;
};

type StepExecutor = () => Promise<StepResult>;

export async function runInternalE2EScenario(input: {
  source: { head: string; tree: string };
  steps: Record<InternalE2ECheckpointCode, StepExecutor>;
  restartFingerprints: () => { before: string; after: string };
}) {
  const checkpoints: InternalE2ECheckpoint[] = [];
  for (const [index, code] of INTERNAL_E2E_CHECKPOINT_CODES.entries()) {
    const result = await input.steps[code]();
    const checkpoint = internalE2ECheckpointSchema.parse({
      sequence: index + 1,
      code,
      state: "PASS",
      observed: result.observed,
      canonicalFingerprint: sha256Canonical(result.canonicalState),
      externalEffectCount: result.externalEffectCount,
    });
    assertInternalE2EReportSanitized(checkpoint, `checkpoint.${code}`);
    checkpoints.push(checkpoint);
  }
  assertInternalE2ECheckpointOrder(checkpoints);
  const restart = input.restartFingerprints();
  if (restart.before !== restart.after) throw new Error("INTERNAL_E2E_RESTART_FINGERPRINT_DRIFT");
  const withoutHash = {
    schemaVersion: 1 as const,
    scenarioKey: INTERNAL_E2E_SCENARIO_KEY,
    scenarioVersion: INTERNAL_E2E_SCENARIO_VERSION,
    scenarioHash: INTERNAL_E2E_SCENARIO_HASH,
    source: input.source,
    databaseMode: "DISPOSABLE_POSTGRESQL" as const,
    checkpoints,
    preRestartFingerprint: restart.before,
    postRestartFingerprint: restart.after,
    providerObserved: false as const,
    externalEffectCount: 0 as const,
    verdict: "INTERNAL_SYNTHETIC_E2E_PASS" as const,
  };
  assertInternalE2EReportSanitized(withoutHash);
  return internalE2EReportSchema.parse({ ...withoutHash, reportHash: sha256Canonical(withoutHash) });
}

