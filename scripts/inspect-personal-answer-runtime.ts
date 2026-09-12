import { loadAnswerConfiguration } from "../src/server/personal-assistant/answer-worker";
import { loadPersonalModelConfiguration } from "../src/server/model-gateway/personal-intent/configuration";
import { inspectPersonalModelIngressConfiguration } from "../src/server/model-gateway/personal-intent/operator-ingress-contract";
import { personalAnswerRuntimeFromOperatorConfiguration } from "../src/server/model-gateway/personal-intent/operator-setup";
import { inspectAnswerBudget } from "../src/server/model-gateway/personal-answer/budget-policy";
import { readPersonalOperatorConfiguration } from "../src/server/model-gateway/personal-intent/operator-configuration-environment";
import { inspectModelAuthority, inspectPersonalModelPilotEnvelope } from "../src/server/model-gateway/personal-intent/admission";
import { resolveAccountSpendCeilingMicros } from "../src/server/account-spend";
import { requireConnectorKey } from "../src/server/personal-assistant/credential-cipher";
import { prisma } from "../src/lib/db";

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
try {
  const raw = readPersonalOperatorConfiguration(env);
  const ingress = inspectPersonalModelIngressConfiguration(raw);
  const configuration = personalAnswerRuntimeFromOperatorConfiguration(JSON.parse(ingress.configuration.manifestUtf8));
  stage = "BUDGET";
  const budget = inspectAnswerBudget(configuration.rateConfiguration, "personal_answer_candidate_v1", new Date());
  inspectPersonalModelPilotEnvelope(env, new Date(), budget.ceilingCadMicros, configuration.pilotEnvelopeReview);
  report.splitArtifactValid = true;
  report.reviewedBudgetCurrent = true;
  report.reservationUsdMicros = budget.reservationUsdMicros.toString();
  report.reservationCadMicros = budget.reservationCadMicros.toString();
  report.budgetCeilingCadMicros = budget.ceilingCadMicros.toString();
  report.accountSpendCeilingConfigured = (resolveAccountSpendCeilingMicros("openrouter", env) ?? 0n) >= budget.reservationUsdMicros;
  stage = "ENCRYPTION_CONFIGURATION";
  requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
  report.encryptionConfigurationValid = true;
  stage = "OWNER_CONNECTION";
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await inspectModelAuthority(tx, { subject: { kind: "personal_assistant_operation", workspaceId: ingress.manifest.workspaceId,
      operationId: "read-only-configuration-inspection" }, actorUserId: ingress.manifest.ownerUserId }, new Date());
    const credentials = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) AS count FROM "ConstructionConnectorCredential" c
      JOIN "ConstructionConnectorAccount" a ON a.id=c."connectorAccountId" AND a."credentialRef"=c.id
      WHERE a."workspaceId"=$1 AND a.provider='openrouter' AND a.status='connected' AND c."revokedAt" IS NULL`, ingress.manifest.workspaceId);
    if (Number(credentials[0]?.count) !== 1) throw new Error();
  });
  report.ownerConnectionReady = true;
} catch { report.failedStage = stage; }
report.readyForOwnerSms = report.answerEngineEnabled === true && report.answerTransportEnabled === true
  && report.externalTransportEnabled === true && report.answerConfigurationLoaded === true
  && report.intentConfigurationStatus === "CONFIGURED_NOT_AUTHORIZED" && report.accountSpendCeilingConfigured === true
  && report.ownerConnectionReady === true && report.encryptionConfigurationValid === true && !report.failedStage;
console.log(JSON.stringify(report));
await prisma.$disconnect();
if (process.argv.includes("--require-ready") && !report.readyForOwnerSms) process.exitCode = 1;
}
void main().catch(() => { console.error("PERSONAL_ANSWER_INSPECTION_UNAVAILABLE"); process.exitCode = 1; });
