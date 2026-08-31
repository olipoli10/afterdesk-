import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { founderObservationSubmissionSchema, sha256Canonical } from "./observation-contract";

const evidence = resolve(import.meta.dirname, "../evidence");
const raw = JSON.parse(readFileSync(resolve(evidence, "founder-observation.json"), "utf8"));
const { observationSha256, ...payload } = raw;
const observation = founderObservationSubmissionSchema.parse(payload);
if (sha256Canonical(observation) !== observationSha256) throw new Error("FOUNDER_OBSERVATION_HASH_MISMATCH");
const measurements = JSON.parse(readFileSync(resolve(evidence, "technical-measurements.json"), "utf8"));
const pass = observation.approvalComprehensionRating >= 4
  && observation.actionabilityRating >= 4
  && observation.observableAdvantageRating >= 1
  && observation.nextDecisionIdentified
  && measurements.appointmentAccuracy === 1
  && measurements.tomorrowAnswerAccuracy === 1
  && measurements.duplicateReplayProtectionObserved
  && measurements.exactApprovalObserved
  && measurements.inventedFactCount === 0;
process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  adjudicatedAtUtc: new Date().toISOString(),
  observationSha256,
  verdict: pass ? "FOUNDER_OWNED_CONSTRUCTION_ASSISTANT_LOOP_OBSERVED_PASS" : "REWORK",
  reasons: pass ? [] : [
    "FOUNDER_ACTIONABILITY_BELOW_THRESHOLD",
    "FOUNDER_OBSERVABLE_ADVANTAGE_BELOW_THRESHOLD",
    "CLEAR_APPOINTMENT_NOT_CREATED_DURING_OBSERVATION",
    "CLARIFICATION_NOT_PRODUCED_DURING_OBSERVATION",
    "TOMORROW_QUERY_NOT_ANSWERED_DURING_OBSERVATION",
    "LOCAL_INBOUND_AND_REPLAY_NOT_OBSERVED",
    "EXACT_APPROVAL_NOT_OBSERVED",
    "EQUAL_INPUT_STATELESS_CONTROL_NOT_HUMAN_TIMED",
  ],
  productCorrectionDoesNotRewriteFounderVerdict: true,
}, null, 2));
