import "server-only";
import { z } from "zod";
import { canonicalFingerprint } from "../evidence";
import { inspectPersonalModelPilotEnvelope } from "./admission";
import { inspectPersonalModelBudget, type PersonalModelRateConfiguration } from "./budget-policy";

const schema = z.object({ schemaVersion: z.literal(1), policyVersionId: z.string().regex(/^[A-Za-z0-9_-]{1,191}$/),
  rateConfiguration: z.unknown(), pilotEnvelopeReview: z.unknown() }).strict();

/** Trusted server configuration only. No prices, reviews, keys or route IDs are
 * accepted from a mobile request. Configuration is not owner consent or budget
 * reservation, and never certifies an external provider. */
export function loadPersonalModelConfiguration(env: NodeJS.ProcessEnv = process.env, now = new Date()) {
  if (env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED !== "true") {
    return Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const, reason: "PERSONAL_MODEL_DISABLED" });
  }
  try {
    const encoded = env.ENDVERA_PERSONAL_MODEL_CONFIGURATION_JSON;
    if (!encoded || Buffer.byteLength(encoded, "utf8") > 16_384) throw new Error();
    const configuration = schema.parse(JSON.parse(encoded));
    const budgetPolicy = inspectPersonalModelBudget(configuration.rateConfiguration, now);
    const pilotEnvelopeReview = inspectPersonalModelPilotEnvelope(env, now, budgetPolicy.ceilingCadMicros, configuration.pilotEnvelopeReview);
    // The strict budget inspector validated every field; JSON carries no live
    // mutable object graph or accessor functions from a caller.
    const rateConfiguration = Object.freeze(configuration.rateConfiguration as PersonalModelRateConfiguration);
    return Object.freeze({ status: "CONFIGURED_NOT_AUTHORIZED" as const, executionAuthorized: false as const,
      policyVersionId: configuration.policyVersionId, rateConfiguration, pilotEnvelopeReview, budgetPolicy,
      configurationFingerprint: canonicalFingerprint({ schemaVersion: 1, policyVersionId: configuration.policyVersionId,
        reviewedRateFingerprint: budgetPolicy.reviewedRateFingerprint, pilotEnvelopeReview }),
    });
  } catch {
    // Do not leak an injected value (including a key) through Zod/error output.
    return Object.freeze({ status: "REFUSED" as const, executionAuthorized: false as const, reason: "PERSONAL_MODEL_CONFIGURATION_INVALID" });
  }
}
