import { randomUUID } from "node:crypto";
import { loadAnswerConfiguration } from "../src/server/personal-assistant/answer-worker";
import { loadPersonalModelConfiguration } from "../src/server/model-gateway/personal-intent/configuration";
import { inspectPersonalModelIngressConfiguration } from "../src/server/model-gateway/personal-intent/operator-ingress-contract";
import { personalAnswerRuntimeFromOperatorConfiguration } from "../src/server/model-gateway/personal-intent/operator-setup";
import { inspectAnswerBudget } from "../src/server/model-gateway/personal-answer/budget-policy";
import { readPersonalOperatorConfiguration } from "../src/server/model-gateway/personal-intent/operator-configuration-environment";
import { inspectModelAuthority, inspectPersonalModelPilotEnvelope } from "../src/server/model-gateway/personal-intent/admission";
import { resolveAccountSpendCeilingMicros } from "../src/server/account-spend";
import { openConnectorSecret, requireConnectorKey } from "../src/server/personal-assistant/credential-cipher";
import { prisma } from "../src/lib/db";
import { createAnswerInput } from "../src/server/model-gateway/personal-answer/contract";
import { answerWireRequest, createOpenRouterAnswerAdapter } from "../src/server/model-gateway/personal-answer/openrouter-adapter";
import { createAnswerTransport } from "../src/server/model-gateway/personal-answer/openrouter-transport";

// Read-only diagnosis. Never print environment values, credentials, or raw errors.
const env = process.env;
const report: Record<string, unknown> = {
  version: "personal-answer-runtime-inspection-v1",
  observedAt: new Date().toISOString(),
  answerEngineEnabled: env.ENDVERA_PERSONAL_ANSWER_ENGINE_ENABLED === "true",
  answerTransportEnabled: env.ENDVERA_PERSONAL_ANSWER_EXTERNAL_TRANSPORT_ENABLED === "true",
  externalTransportEnabled: env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED === "ENABLED",
  splitConfigurationPresent: env.ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION_PART_COUNT !== undefined,
  answerConfigurationLoaded: loadAnswerConfiguration(env, false) !== null,
  intentConfigurationStatus: loadPersonalModelConfiguration(env).status,
  accountSpendCeilingConfigured: /^[1-9][0-9]*$/.test(env.ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS ?? ""),
};
async function main() {
let stage = "CONFIGURATION";
let providerApiKey: string | undefined;
let encryptionKey: Buffer | undefined;
try {
  const raw = readPersonalOperatorConfiguration(env);
  const ingress = inspectPersonalModelIngressConfiguration(raw);
  const configuration = personalAnswerRuntimeFromOperatorConfiguration(JSON.parse(ingress.configuration.manifestUtf8));
  stage = "BUDGET";
  const budget = inspectAnswerBudget(configuration.rateConfiguration, "personal_answer_candidate_v1", new Date());
  report.allowedModels = budget.allowedModels;
  report.providerEndpoints = budget.providerEndpoints;
  report.configuredTimeoutMs = 25_000;
  report.maxOutputTokens = budget.maxOutputTokens;
  inspectPersonalModelPilotEnvelope(env, new Date(), budget.ceilingCadMicros, configuration.pilotEnvelopeReview);
  report.splitArtifactValid = true;
  report.reviewedBudgetCurrent = true;
  report.reservationUsdMicros = budget.reservationUsdMicros.toString();
  report.reservationCadMicros = budget.reservationCadMicros.toString();
  report.budgetCeilingCadMicros = budget.ceilingCadMicros.toString();
  report.accountSpendCeilingConfigured = (resolveAccountSpendCeilingMicros("openrouter", env) ?? 0n) >= budget.reservationUsdMicros;
  stage = "ENCRYPTION_CONFIGURATION";
  encryptionKey = requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
  report.encryptionConfigurationValid = true;
  stage = "OWNER_CONNECTION";
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await inspectModelAuthority(tx, { subject: { kind: "personal_assistant_operation", workspaceId: ingress.manifest.workspaceId,
      operationId: "read-only-configuration-inspection" }, actorUserId: ingress.manifest.ownerUserId }, new Date());
    const credentials = await tx.$queryRawUnsafe<Array<{ accountId: string; credentialId: string; ciphertext: string }>>(`SELECT a.id AS "accountId",c.id AS "credentialId",c.ciphertext FROM "ConstructionConnectorCredential" c
      JOIN "ConstructionConnectorAccount" a ON a.id=c."connectorAccountId" AND a."credentialRef"=c.id
      WHERE a."workspaceId"=$1 AND a.provider='openrouter' AND a.status='connected' AND c."revokedAt" IS NULL`, ingress.manifest.workspaceId);
    if (credentials.length !== 1) throw new Error();
    stage = "CREDENTIAL_DECRYPTION";
    const row = credentials[0];
    const binding = JSON.stringify([ingress.manifest.workspaceId, row.accountId, `openrouter-api-key:${row.credentialId}`]);
    const decoded = JSON.parse(openConnectorSecret(row.ciphertext, binding, encryptionKey!)) as { apiKey?: unknown };
    if (typeof decoded.apiKey !== "string" || !/^[A-Za-z0-9_-]{24,512}$/u.test(decoded.apiKey)) throw new Error();
    providerApiKey = decoded.apiKey;
  });
  report.credentialDecryptionValid = true;
  report.ownerConnectionReady = true;
  if (process.argv.includes("--verify-provider-key")) {
    stage = "PROVIDER_KEY_VERIFICATION";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/key", {
        method: "GET", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { authorization: `Bearer ${providerApiKey}`, accept: "application/json" },
      });
      report.providerKeyHttpStatus = response.status;
      report.providerKeyAccepted = response.ok;
      await response.body?.cancel();
      if (!response.ok) throw new Error();
    } finally { clearTimeout(timeout); }
  }
  if (process.argv.includes("--verify-provider-answer")) {
    stage = "PROVIDER_ANSWER_VERIFICATION";
    const input = createAnswerInput({ requestId: `diagnostic-${randomUUID()}`, workspaceId: ingress.manifest.workspaceId,
      body: "Explique en une phrase la différence entre le béton 25 MPa et 32 MPa.", senderVerified: true,
      workspaceBound: true, receivedAt: new Date().toISOString() });
    const adapterConfiguration = { enabled: true, allowedModels: budget.allowedModels, providerEndpoints: budget.providerEndpoints,
      timeoutMs: 20_000, maxOutputTokens: 256 };
    const expectedRequest = answerWireRequest(input, adapterConfiguration);
    const transport = createAnswerTransport({ enabled: true, expectedRequest, getApiKey: async () => providerApiKey! }, env);
    const result = await createOpenRouterAnswerAdapter(adapterConfiguration, transport).dispatch(input, new AbortController().signal);
    report.providerAnswerStatus = result.status;
    if (result.status === "ANSWER_INSPECTED") {
      report.providerAnswerServedModel = result.servedModel;
      report.providerAnswerPromptTokens = result.usage.prompt_tokens;
      report.providerAnswerCompletionTokens = result.usage.completion_tokens;
      report.providerAnswerContractInspected = true;
    } else if (result.status === "UNCERTAIN") {
      report.providerAnswerHttpStatus = result.httpStatus;
      report.providerAnswerContractStatus = result.resultContractStatus;
    }
    if (result.status !== "ANSWER_INSPECTED") throw new Error();
  }
} catch { report.failedStage = stage; }
finally { encryptionKey?.fill(0); providerApiKey = undefined; }
report.readyForOwnerSms = report.answerEngineEnabled === true && report.answerTransportEnabled === true
  && report.externalTransportEnabled === true && report.answerConfigurationLoaded === true
  && report.intentConfigurationStatus === "CONFIGURED_NOT_AUTHORIZED" && report.accountSpendCeilingConfigured === true
  && report.ownerConnectionReady === true && report.encryptionConfigurationValid === true
  && report.credentialDecryptionValid === true && !report.failedStage;
console.log(JSON.stringify(report));
await prisma.$disconnect();
if (process.argv.includes("--require-ready") && !report.readyForOwnerSms) process.exitCode = 1;
}
void main().catch(() => { console.error("PERSONAL_ANSWER_INSPECTION_UNAVAILABLE"); process.exitCode = 1; });
