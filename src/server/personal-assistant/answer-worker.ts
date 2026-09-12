import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { admitPersonalAnswer, inspectAnswerContext, type AnswerAdmissionConfiguration } from "@/server/model-gateway/personal-answer/admission";
import { dispatchPersonalAnswer } from "@/server/model-gateway/personal-answer/dispatch";
import { createAnswerTransport } from "@/server/model-gateway/personal-answer/openrouter-transport";
import { answerWireRequest } from "@/server/model-gateway/personal-answer/openrouter-adapter";
import { personalModelCredentialForDispatch } from "./model-connection";
import { assistantReportLink, formatAssistantAnswerSms } from "./answer-report";
import type { PersonalSmsExecutionContext } from "./sms-worker";
import type { Prisma } from "@prisma-client";
import { inspectPersonalModelIngressConfiguration } from "@/server/model-gateway/personal-intent/operator-ingress-contract";
import { personalAnswerRuntimeFromOperatorConfiguration } from "@/server/model-gateway/personal-intent/operator-setup";
import { readPersonalOperatorConfiguration } from "@/server/model-gateway/personal-intent/operator-configuration-environment";

const configurationSchema = z.object({
  general: z.object({ policyVersionId: z.string().min(1).max(191), rateConfiguration: z.unknown(), pilotEnvelopeReview: z.unknown() }).strict(),
  research: z.object({ policyVersionId: z.string().min(1).max(191), rateConfiguration: z.unknown(), pilotEnvelopeReview: z.unknown(), searchDisclosureReview: z.unknown() }).strict().nullable(),
}).strict();
export type PersonalAnswerSmsResult = Readonly<{
  reply: string; finalizeAnswer?: (tx: Prisma.TransactionClient) => Promise<void>;
}>;
const ANSWER_REINSPECTION_MAX_MS = 8_000;
export const ANSWER_REINSPECTION_MAX_WAIT_MS = 1_000;
const ANSWER_REINSPECTION_RESERVE_MS = 3_000;
export function personalAnswerReinspectionTimeoutMs(deadlineAt: number, now = Date.now()) {
  const available = deadlineAt - now - ANSWER_REINSPECTION_RESERVE_MS - ANSWER_REINSPECTION_MAX_WAIT_MS;
  if (!Number.isFinite(available) || available < 1) throw new Error("ANSWER_REINSPECTION_DEADLINE");
  return Math.min(ANSWER_REINSPECTION_MAX_MS, available);
}
export function loadAnswerConfiguration(env: NodeJS.ProcessEnv, research: boolean): AnswerAdmissionConfiguration | null {
  const raw = env.ENDVERA_PERSONAL_ANSWER_CONFIGURATION_JSON;
  if (env.ENDVERA_PERSONAL_ANSWER_ENGINE_ENABLED !== "true") return null;
  try {
    if (raw) {
      if (raw.length > 50_000) return null;
      const parsed = configurationSchema.parse(JSON.parse(raw)); return research ? parsed.research : parsed.general;
    }
    if (research) return null;
    const ingress = inspectPersonalModelIngressConfiguration(readPersonalOperatorConfiguration(env));
    return personalAnswerRuntimeFromOperatorConfiguration(JSON.parse(ingress.configuration.manifestUtf8));
  } catch { return null; }
}
export async function processPersonalAnswerSms(context: PersonalSmsExecutionContext, research: boolean, env: NodeJS.ProcessEnv = process.env): Promise<PersonalAnswerSmsResult> {
  const configuration = loadAnswerConfiguration(env, research);
  if (!configuration || env.ENDVERA_PERSONAL_ANSWER_EXTERNAL_TRANSPORT_ENABLED !== "true" || env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED !== "ENABLED") {
    return { reply: "La connexion IA pour répondre à cette question n’est pas encore active. Ta demande est conservée dans ENDVERA." };
  }
  const initialHash = canonicalFingerprint(configuration);
  const unchanged = () => {
    if (context.signal.aborted || Date.now() >= context.deadlineAt || canonicalFingerprint(loadAnswerConfiguration(env, research)) !== initialHash) throw new Error("ANSWER_CONFIGURATION_CHANGED");
  };
  try {
    unchanged();
    const admission = await admitPersonalAnswer({ context, configuration, enabled: true }, env);
    const current = async () => {
      unchanged();
      await prisma.$transaction(async tx => {
        const inspected = await inspectAnswerContext(tx, { context, configuration, enabled: true }, env);
        if (inspected.bindingFingerprint !== admission.current.bindingFingerprint) throw new Error("ANSWER_CURRENT_AUTHORITY_REQUIRED");
      }, { isolationLevel: "Serializable", maxWait: ANSWER_REINSPECTION_MAX_WAIT_MS,
        timeout: personalAnswerReinspectionTimeoutMs(context.deadlineAt) });
      unchanged();
    };
    const transport = createAnswerTransport({ enabled: true,
      expectedRequest: answerWireRequest(admission.current.candidateInput, admission.current.adapterConfiguration),
      getApiKey: async () => {
        await current();
        const key = await personalModelCredentialForDispatch({ source: admission.current.source, modelAuthority: admission.current.authority }, env);
        await current(); return key;
      } }, env);
    const dispatched = await dispatchPersonalAnswer({ admission, transport, enabled: true, transportMode: "EXTERNAL_PROVIDER" }, env);
    unchanged();
    if (dispatched.status !== "ANSWER_STORED") return { reply: "Je n’ai pas pu confirmer la réponse à ta question. La demande est conservée; aucun nouvel essai automatique n’a été lancé." };
    const reply = formatAssistantAnswerSms(dispatched.answer, assistantReportLink(dispatched.childId, env));
    return { reply, finalizeAnswer: async tx => {
      unchanged();
      const inspected = await inspectAnswerContext(tx, { context, configuration, enabled: true }, env);
      if (inspected.bindingFingerprint !== admission.current.bindingFingerprint) throw new Error("ANSWER_AUTHORITY_CHANGED_BEFORE_SMS");
      const saved = await tx.personalAssistantOperation.findFirst({ where: { id: dispatched.childId, workspaceId: context.claim.workspaceId,
        createdByUserId: context.claim.userId, kind: "personal_answer_v1", status: "completed" }, select: { result: true } });
      if (!saved?.result || typeof saved.result !== "object" || Array.isArray(saved.result)
        || canonicalFingerprint(saved.result.answer) !== canonicalFingerprint(dispatched.answer)) throw new Error("ANSWER_REPORT_CHANGED");
      unchanged();
    } };
  } catch { return { reply: "La réponse IA est temporairement indisponible pour cette demande. Elle est conservée dans ENDVERA." }; }
}
