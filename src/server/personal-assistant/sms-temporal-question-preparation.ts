import "server-only";
import { z } from "zod";
import { canonicalFingerprint, canonicalJson } from "@/server/model-gateway/evidence";
import { loadStoredPersonalIntentReviewProof } from "@/server/model-gateway/personal-intent/review-proof";
import { hasUnsafePersonalTemporalSourceContext } from "@/server/model-gateway/personal-intent/correlated-temporal-evidence";
import { classifyPersonalCalendarTemporalSlot, resolvePersonalCalendarTemporal } from "@/server/model-gateway/personal-intent/temporal";
import { formatPersonalModelReviewMessage, PERSONAL_MODEL_REVIEW_MESSAGE_VERSION } from "./model-review-message";
import { prepareSmsTemporalClarificationInTransaction } from "./sms-temporal-clarification-store";
import { temporalActorSchema, temporalClaimSchema, temporalRegistryEnabled, temporalRegistryDisabled, temporalRegistryTransaction,
  temporalCurrentBinding, temporalLockSourceNamespace, temporalConversationNamespace, temporalRequireLive, temporalSha, type TemporalRegistryDB, type TemporalRegistryContext } from "./sms-temporal-clarification-authority";
import type { ConnectorEnvironment } from "./google-client";

const id = z.string().min(1).max(191);
const inspectionInput = z.object({ actor: temporalActorSchema, sourceClaim: temporalClaimSchema, modelChildOperationId: id }).strict();
const attachmentInput = inspectionInput.extend({ questionOutboundOperationId: id }).strict();
const enabled = (env: ConnectorEnvironment) => temporalRegistryEnabled(env) && env.ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED === "true";
const live = (env: ConnectorEnvironment, context: TemporalRegistryContext) => {
  temporalRequireLive(context, env);
  if (!enabled(env)) throw new Error("TEMPORAL_QUESTION_PREPARATION_DISABLED");
};
const fixedReformulation = "Reformule le rendez-vous complet avec son titre, sa date, son heure de début et son heure de fin au format 24 heures. Aucun rendez-vous n’est créé.";
type Refusal = "UNSAFE_SOURCE_CONTEXT" | "INCOMPLETE_ORIGINAL_TEMPLATE" | "NO_SINGLE_AMBIGUOUS_TIME" | "UNSUPPORTED_SLOT_GRAMMAR";
const refuse = (reason: Refusal) => Object.freeze({ status: "REFORMULATION_REQUIRED" as const, reason, reply: fixedReformulation,
  registryPrepared: false as const, executionAuthorized: false as const, providerExecutionPerformed: false as const, preview: null });
const freeze = <T>(value: T): T => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

/** Call BEFORE the caller creates a question. Read-only eligibility is not an
 * action capability. No fake second SMS, UTC calculation or draft is produced. */
export async function inspectSmsTemporalQuestionPreparationInTransaction(tx: TemporalRegistryDB, untrusted: z.infer<typeof inspectionInput>,
  env: ConnectorEnvironment = process.env, context: TemporalRegistryContext) {
  if (!enabled(env)) return temporalRegistryDisabled();
  const input = inspectionInput.parse(untrusted);
  if (input.actor.userId !== input.sourceClaim.userId || input.actor.workspaceId !== input.sourceClaim.workspaceId) throw new Error("TEMPORAL_QUESTION_ACTOR_MISMATCH");
  await temporalRegistryTransaction(tx, context, env); live(env, context);
  const namespace = await temporalLockSourceNamespace(tx, input.actor, input.sourceClaim.operationId); live(env, context);
  const proof = await loadStoredPersonalIntentReviewProof(tx, { enabled: true, ...input.actor, sourceOperationId: input.sourceClaim.operationId,
    modelChildOperationId: input.modelChildOperationId }, env);
  live(env, context);
  if (proof.status !== "REVIEW_PROOF_INSPECTED_NOT_AUTHORIZED") throw new Error("TEMPORAL_QUESTION_BOUND_PROOF_REQUIRED");
  const original = proof.source.input, actions = proof.inspected.proposal.actions;
  if (hasUnsafePersonalTemporalSourceContext(original.source)) return refuse("UNSAFE_SOURCE_CONTEXT");
  const action = actions[0];
  if (actions.length !== 1 || !action || action.kind !== "PREPARE_CALENDAR_EVENT" || action.dependsOn.length) return refuse("INCOMPLETE_ORIGINAL_TEMPLATE");
  const rawProposal = canonicalJson(proof.inspected.proposal), temporalContext = { receivedAt: proof.source.receivedAt, timezone: proof.source.timezone };
  const temporal = resolvePersonalCalendarTemporal(original, rawProposal, action.id, temporalContext);
  if (temporal.status !== "CLARIFY" || temporal.reason !== "AMBIGUOUS_TIME") return refuse("NO_SINGLE_AMBIGUOUS_TIME");
  const start = classifyPersonalCalendarTemporalSlot(action.starts.quote, "START", temporalContext), end = classifyPersonalCalendarTemporalSlot(action.ends.quote, "END", temporalContext);
  if (start === "UNSUPPORTED" || end === "UNSUPPORTED") return refuse("UNSUPPORTED_SLOT_GRAMMAR");
  if ((start === "AMBIGUOUS") === (end === "AMBIGUOUS")) return refuse("NO_SINGLE_AMBIGUOUS_TIME");
  // Reload the exact current source lease and owner/model/calendar consent; the
  // canonical loader above also binds current model fingerprint and proposal.
  const current = await temporalCurrentBinding(tx, input.actor, input.sourceClaim.operationId, input.modelChildOperationId, env, input.sourceClaim);
  live(env, context);
  if (current.source.body !== original.source || current.source.operationId !== original.sourceOperationId
    || current.source.from !== proof.row.sourceRequest.from || current.source.to !== proof.row.sourceRequest.to
    || namespace !== temporalConversationNamespace(current.binding.ownerNumber, current.binding.endveraNumber)
    || current.source.receivedAt !== proof.source.receivedAt || current.binding.timezone !== proof.source.timezone) throw new Error("TEMPORAL_QUESTION_SOURCE_CHANGED");
  const wireText = formatPersonalModelReviewMessage({ status: "REVIEW_PREPARED_NOT_AUTHORIZED", actions: [{ status: "CLARIFY", question: temporal.question }] });
  const request = { to: current.binding.ownerNumber, from: current.binding.endveraNumber, text: wireText, sourceOperationId: input.sourceClaim.operationId };
  const value = { status: "ELIGIBLE_QUESTION_NOT_AUTHORIZED" as const, schemaVersion: 1 as const, executionAuthorized: false as const,
    providerExecutionPerformed: false as const, temporalResolutionPerformed: false as const, registryPrepared: false as const, preview: null,
    actionId: action.id, slot: start === "AMBIGUOUS" ? "START" as const : "END" as const,
    sourceOperationId: input.sourceClaim.operationId, sourceRequestHash: current.source.requestHash,
    modelChildOperationId: input.modelChildOperationId, proposalEvidenceRef: proof.row.resultEvidenceRef,
    anchorReceivedAt: current.source.receivedAt, timezone: current.binding.timezone,
    question: temporal.question, wireText, wireTextHash: temporalSha(wireText), wireFormatterVersion: PERSONAL_MODEL_REVIEW_MESSAGE_VERSION,
    request, requestHash: temporalSha(JSON.stringify(request)), currentBindingHash: canonicalFingerprint(current.binding) };
  return freeze({ ...value, inspectionHash: canonicalFingerprint(value) });
}

/** Call only AFTER inserting the eligible exact ordinary question and BEFORE
 * source completion in that same transaction. Reinspection refusal throws so a
 * changed/ineligible question is rolled back, never silently left publishable. */
export async function attachSmsTemporalQuestionInTransaction(tx: TemporalRegistryDB, untrusted: z.infer<typeof attachmentInput>,
  env: ConnectorEnvironment = process.env, context: TemporalRegistryContext) {
  // This entry point is post-question: even OFF must abort its caller's
  // transaction rather than silently leave an unbound question publishable.
  if (!enabled(env)) throw new Error("TEMPORAL_QUESTION_PREPARATION_DISABLED");
  const input = attachmentInput.parse(untrusted);
  const inspection = await inspectSmsTemporalQuestionPreparationInTransaction(tx, { actor: input.actor, sourceClaim: input.sourceClaim,
    modelChildOperationId: input.modelChildOperationId }, env, context);
  live(env, context);
  if (inspection.status !== "ELIGIBLE_QUESTION_NOT_AUTHORIZED") throw new Error(`TEMPORAL_QUESTION_ATTACH_REFUSED:${inspection.status === "REFORMULATION_REQUIRED" ? inspection.reason : "DISABLED"}`);
  const prepared = await prepareSmsTemporalClarificationInTransaction(tx, { actor: input.actor, sourceClaim: input.sourceClaim,
    modelChildOperationId: input.modelChildOperationId, reviewActionId: inspection.actionId, questionOutboundOperationId: input.questionOutboundOperationId }, env, context);
  live(env, context);
  if (prepared.status !== "PREPARED_FOR_SOURCE_COMMIT" || formatPersonalModelReviewMessage(prepared.requiredSourceReview as Parameters<typeof formatPersonalModelReviewMessage>[0]) !== inspection.wireText) throw new Error("TEMPORAL_QUESTION_STORE_RESULT_CHANGED");
  return prepared;
}
