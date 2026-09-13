import "server-only";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { admitPersonalIntent } from "@/server/model-gateway/personal-intent/admission";
import { loadPersonalModelConfiguration } from "@/server/model-gateway/personal-intent/configuration";
import { dispatchPersonalIntent } from "@/server/model-gateway/personal-intent/dispatch";
import { createOpenRouterPersonalIntentAdapter } from "@/server/model-gateway/personal-intent/openrouter-adapter";
import { createPersonalOpenRouterTransport } from "@/server/model-gateway/personal-intent/openrouter-transport";
import { prepareStoredPersonalIntentReview } from "@/server/model-gateway/personal-intent/review-consumer";
import { personalModelCredentialForDispatch } from "./model-connection";
import type { PersonalSmsExecutionContext } from "./sms-worker";
import type { ConnectorEnvironment } from "./google-client";
import { formatPersonalModelReviewMessage } from "./model-review-message";

type Review = Awaited<ReturnType<typeof prepareStoredPersonalIntentReview>>;
export type PersonalModelSmsResult = Readonly<{ reply: string; finalizeReview?: (tx: Prisma.TransactionClient) => Promise<Review> }>;
export const PERSONAL_INTENT_PROVIDER_TIMEOUT_MS = 40_000;

export function personalModelReviewReply(review: Review): string {
  return formatPersonalModelReviewMessage(review);
}

/** Exclusive candidate path. Never falls back to the legacy action interpreter.
 * Public input supplies no model, key, price, destination or provider endpoint.
 * Admission and one-attempt dispatch run before the source's final transaction;
 * draft preparation MUST run inside that transaction before the exact source CAS.
 */
export async function processPersonalModelSms(context: PersonalSmsExecutionContext, environment: ConnectorEnvironment = process.env): Promise<PersonalModelSmsResult> {
  const env = environment as NodeJS.ProcessEnv;
  const live = () => { if (context.signal.aborted || Date.now() >= context.deadlineAt) throw new Error("PERSONAL_MODEL_SOURCE_DEADLINE"); };
  const configuration = loadPersonalModelConfiguration(env);
  if (configuration.status !== "CONFIGURED_NOT_AUTHORIZED" || env.ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED !== "true" || env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED !== "ENABLED") {
    return { reply: "La connexion IA personnelle n’est pas encore activée ou sa configuration doit être vérifiée dans ENDVERA. Rien n’a été exécuté." };
  }
  const { claim } = context;
  const configurationFingerprint = configuration.configurationFingerprint;
  function requireCurrentConfiguration() {
    live();
    const current = loadPersonalModelConfiguration(env);
    if (current.status !== "CONFIGURED_NOT_AUTHORIZED" || current.configurationFingerprint !== configurationFingerprint
      || env.ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED !== "true" || env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED !== "ENABLED") throw new Error("PERSONAL_MODEL_CONFIGURATION_CHANGED");
  }
  async function requireLiveSource() {
    requireCurrentConfiguration();
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "PersonalAssistantOperation"
      WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND attempts=$4 AND "leaseUntil"=($5::timestamptz AT TIME ZONE 'UTC')
        AND kind='personal_sms_inbound' AND status='processing' AND "leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')`,
      claim.operationId, claim.workspaceId, claim.userId, claim.attempt, new Date(claim.leaseUntil));
    live();
    if (rows.length !== 1) throw new Error("PERSONAL_MODEL_SOURCE_CLAIM_LOST");
  }
  await requireLiveSource();
  const admission = await admitPersonalIntent({ enabled: true,
    subject: { kind: "personal_assistant_operation", operationId: claim.operationId, workspaceId: claim.workspaceId },
    policyVersionId: configuration.policyVersionId, rateConfiguration: configuration.rateConfiguration,
    pilotEnvelopeReview: configuration.pilotEnvelopeReview }, env);
  live();
  if (admission.status !== "ADMITTED_NOT_DISPATCHED") throw new Error("PERSONAL_MODEL_ADMISSION_REFUSED");
  if (admission.source.actorUserId !== claim.userId) throw new Error("PERSONAL_MODEL_SOURCE_ACTOR_CHANGED");
  const policy = admission.budgetPolicy;
  const transport = createPersonalOpenRouterTransport({ enabled: true, source: admission.source.input,
    modelKey: policy.model, providerEndpointSlug: policy.providerEndpoint, maxOutputTokens: policy.maxOutputTokens,
    getApiKey: async () => {
      // Invoked only after the durable gateway dispatch CAS, never by status or
      // by merely constructing the adapter. Revalidate after decryption too.
      await requireLiveSource();
      const key = await personalModelCredentialForDispatch({ source: admission.source, modelAuthority: admission.modelAuthority }, env);
      await requireLiveSource();
      return key;
    } }, env);
  const adapter = createOpenRouterPersonalIntentAdapter({ enabled: true, modelKey: policy.model,
    providerEndpointSlug: policy.providerEndpoint, maxOutputTokens: policy.maxOutputTokens,
    // Preserve five seconds for durable review/source finalization. The former
    // 25 s cap cut off an otherwise admitted request before the worker deadline.
    timeoutMs: Math.max(1, Math.min(PERSONAL_INTENT_PROVIDER_TIMEOUT_MS, Math.floor(context.deadlineAt - Date.now() - 5_000))),
    transportMode: "EXTERNAL_PROVIDER", transport });
  await requireLiveSource();
  const dispatched = await dispatchPersonalIntent({ enabled: true, admission, adapter, abortSignal: context.signal,
    currentRateConfiguration: configuration.rateConfiguration, currentPilotEnvelopeReview: configuration.pilotEnvelopeReview,
    transportMode: "EXTERNAL_PROVIDER" }, env);
  live();
  if (dispatched.status === "CLAIM_LOST") throw new Error("PERSONAL_MODEL_SOURCE_CLAIM_LOST");
  await requireLiveSource();
  if (dispatched.status !== "PROPOSAL_STORED_NOT_AUTHORIZED") {
    const temporaryCapacity = "diagnosticCode" in dispatched && ["PROVIDER_BODY_RATE_LIMIT_EXCEEDED",
      "PROVIDER_BODY_PROVIDER_OVERLOADED", "PROVIDER_BODY_PROVIDER_UNAVAILABLE"].includes(dispatched.diagnosticCode ?? "");
    return { reply: temporaryCapacity
      ? "OpenRouter est temporairement surchargé et n’a pas retourné de proposition. Aucun changement de calendrier, texto à tes contacts ou appel n’a été exécuté. Réessaie ta demande; aucun nouvel essai automatique n’a été lancé."
      : "Je n’ai pas pu interpréter cette demande de façon fiable. Aucun changement de calendrier, texto à tes contacts ou appel n’a été exécuté. La demande est conservée pour vérification." };
  }
  return { reply: "Une proposition doit être vérifiée dans ENDVERA.",
    finalizeReview: async tx => {
      requireCurrentConfiguration();
      const review = await prepareStoredPersonalIntentReview(tx, { enabled: true, userId: claim.userId, workspaceId: claim.workspaceId,
        sourceOperationId: claim.operationId, modelChildOperationId: admission.childOperationId }, env);
      live();
      if (review.status !== "REVIEW_PREPARED_NOT_AUTHORIZED") throw new Error("PERSONAL_MODEL_REVIEW_DISABLED");
      return review;
    } };
}
