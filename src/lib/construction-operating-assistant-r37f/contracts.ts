import { z } from "zod";
import type { R37APreparedRequest } from "@/lib/construction-operating-assistant-r37a/contracts";
import { controlledProviderRunResultSchema } from "@/lib/construction-operating-assistant-r37c/contracts";
import { canonicalProviderEvidenceSchema } from "@/lib/construction-operating-assistant-r37d/contracts";

export const providerFixtureAdapterResultSchema = z.object({
  fixture: z.unknown(),
  latencyMs: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  externalTransportPerformed: z.literal(false),
}).strict();

export const controlledProviderDeliveryResultSchema = z.object({
  controlledRun: controlledProviderRunResultSchema,
  canonicalEvidence: canonicalProviderEvidenceSchema.nullable(),
  fixtureAdapterInvoked: z.boolean(),
  externalTransportPerformed: z.literal(false),
}).strict();

export type ProviderFixtureAdapter = (
  request: R37APreparedRequest,
) => Promise<unknown>;
export type ControlledProviderDeliveryResult = z.infer<typeof controlledProviderDeliveryResultSchema>;
