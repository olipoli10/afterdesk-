import {
  operatingInterpretationSchema,
  type OperatingInterpretation,
  type OperatingInterpreterContext,
} from "@/lib/construction-operating-assistant-r2/contracts";
import { interpretOperatingAssistantCommand } from "@/lib/construction-operating-assistant-r2/interpreter";
import {
  unifiedIntentBody,
  unifiedIntentEnvelopeSchema,
  type UnifiedIntentEnvelope,
} from "./contracts";

export type UnifiedIntentBindings = Readonly<{
  projectId: string | null;
  contactId: string | null;
}>;

function clarification(
  interpretation: OperatingInterpretation,
  input: {
    reason: "AMBIGUOUS_PROJECT" | "AMBIGUOUS_CONTACT";
    question: string;
  },
): OperatingInterpretation {
  return operatingInterpretationSchema.parse({
    ...interpretation,
    intent: "CLARIFICATION_REQUIRED",
    projectId: null,
    contactId: null,
    calendarItemId: null,
    startsAtUtc: null,
    endsAtUtc: null,
    dueAtUtc: null,
    title: null,
    approvalRequired: false,
    queryWindow: null,
    legacy: null,
    clarification: {
      reason: input.reason,
      question: input.question,
      candidateCount: 2,
    },
  });
}

export function resolveUnifiedIntent(
  rawEnvelope: UnifiedIntentEnvelope | unknown,
  context: OperatingInterpreterContext,
  bindings: UnifiedIntentBindings,
): OperatingInterpretation {
  const envelope = unifiedIntentEnvelopeSchema.parse(rawEnvelope);
  const interpreted = interpretOperatingAssistantCommand(unifiedIntentBody(envelope), context);

  if (
    bindings.projectId &&
    interpreted.projectId &&
    bindings.projectId !== interpreted.projectId
  ) {
    return clarification(interpreted, {
      reason: "AMBIGUOUS_PROJECT",
      question: "Le chantier mentionné ne correspond pas au contexte sélectionné. Quel chantier dois-je utiliser?",
    });
  }
  if (
    bindings.contactId &&
    interpreted.contactId &&
    bindings.contactId !== interpreted.contactId
  ) {
    return clarification(interpreted, {
      reason: "AMBIGUOUS_CONTACT",
      question: "Le contact mentionné ne correspond pas au contexte sélectionné. Quel contact dois-je utiliser?",
    });
  }

  if (interpreted.intent === "CLARIFICATION_REQUIRED") return interpreted;

  return operatingInterpretationSchema.parse({
    ...interpreted,
    projectId: interpreted.projectId ?? bindings.projectId,
    contactId: interpreted.contactId ?? bindings.contactId,
  });
}

export function unifiedIntentCanTransition(envelope: UnifiedIntentEnvelope): boolean {
  if (envelope.mode !== "APPLY_VALIDATED") return false;
  if (envelope.source.kind === "PORTAL_TEXT") return true;
  return envelope.source.verificationState === "HUMAN_CONFIRMED";
}
