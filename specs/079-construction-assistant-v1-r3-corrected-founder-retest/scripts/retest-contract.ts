import { z } from "zod";

export const retestContractSchema = z
  .object({
    schemaVersion: z.literal(1),
    founderObservationSource: z.literal("REAL_OLIVIER_SUBMISSION_ONLY", { error: "founder-observation-is-replaced-by-fixture" }),
    consoleRequiresProviderIdCopy: z.literal(false, { error: "console-requires-provider-id-copy" }),
    duplicateReusesSameProviderId: z.literal(true, { error: "duplicate-uses-a-different-provider-id" }),
    timerStartsAt: z.literal("FIRST_FOUNDER_ACTION", { error: "timer-starts-before-first-founder-action" }),
    manualTechnicalSuccessAllowed: z.literal(false, { error: "step-can-be-manually-marked-success" }),
    clearAppointmentExpectedCount: z.literal(1, { error: "clear-appointment-creates-zero-or-two-items" }),
    ambiguityConsequentialWriteCount: z.literal(0, { error: "ambiguity-creates-consequential-write" }),
    tomorrowAnswerSource: z.literal("POSTGRESQL", { error: "tomorrow-answer-uses-static-copy" }),
    inboundResultSource: z.literal("POSTGRESQL", { error: "inbound-result-is-not-postgres-backed" }),
    duplicateCanonicalEffectCount: z.literal(0, { error: "duplicate-creates-second-canonical-effect" }),
    approvalPreview: z.object({
      recipientVisible: z.literal(true, { error: "approval-hides-recipient-channel-or-body" }),
      channelVisible: z.literal(true, { error: "approval-hides-recipient-channel-or-body" }),
      bodyVisible: z.literal(true, { error: "approval-hides-recipient-channel-or-body" }),
    }).strict(),
    firstApprovalSimulatedDeliveryCount: z.literal(1, { error: "first-approval-creates-zero-or-two-local-deliveries" }),
    secondApprovalAttempted: z.literal(true, { error: "second-approval-is-not-attempted" }),
    secondApprovalSimulatedDeliveryCount: z.literal(0, { error: "second-approval-creates-delivery" }),
    projectsCalendarInboxProjectionsAgree: z.literal(true, { error: "projects-calendar-inbox-projections-disagree" }),
    unknownObservationFieldsAccepted: z.literal(false, { error: "unknown-observation-field-is-accepted" }),
    externalTransportCount: z.literal(0, { error: "external-transport-becomes-possible" }),
  })
  .strict();

export function validateRetestContract(value: unknown) {
  return retestContractSchema.parse(value);
}

if (process.argv[1]?.endsWith("retest-contract.ts")) {
  const input = JSON.parse(process.argv[2] ?? "null");
  try {
    validateRetestContract(input);
    process.stdout.write("CONTRACT_VALID\n");
  } catch (error) {
    if (error instanceof z.ZodError) {
      process.stderr.write(`${error.issues[0]?.message ?? "CONTRACT_INVALID"}\n`);
      process.exit(2);
    }
    throw error;
  }
}
