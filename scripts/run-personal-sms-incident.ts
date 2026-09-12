/** Explicit operator canary, never an incoming customer SMS or an unattended
 * retry. Synthetic text only, current owner consent, both durable budget holds,
 * one attempt per fixed incident/case. No credential or raw response logging. */
import { prisma } from "../src/lib/db";
import { loadAnswerConfiguration } from "../src/server/personal-assistant/answer-worker";
import { readPersonalOperatorConfiguration } from "../src/server/model-gateway/personal-intent/operator-configuration-environment";
import { inspectPersonalModelIngressConfiguration } from "../src/server/model-gateway/personal-intent/operator-ingress-contract";
import { inspectModelAuthority, inspectPersonalModelPilotEnvelope } from "../src/server/model-gateway/personal-intent/admission";
import { inspectAnswerBudget } from "../src/server/model-gateway/personal-answer/budget-policy";
import { ANSWER_OPERATION, createAnswerInput } from "../src/server/model-gateway/personal-answer/contract";
import { answerWireRequest, createOpenRouterAnswerAdapter } from "../src/server/model-gateway/personal-answer/openrouter-adapter";
import { createAnswerTransport } from "../src/server/model-gateway/personal-answer/openrouter-transport";
import { safeAdapterReason } from "../src/server/model-gateway/personal-answer/dispatch";
import { reserveAccountProviderSpendInTransaction } from "../src/server/account-spend";
import { canonicalFingerprint } from "../src/server/model-gateway/evidence";
import { openConnectorSecret, requireConnectorKey } from "../src/server/personal-assistant/credential-cipher";
import { twilioDispatchPolicy } from "../src/server/personal-assistant/twilio-outbound";
import { preparePersonalOutbound, approvePersonalOutbound, dispatchPersonalOutbound } from "../src/server/personal-assistant/outbox";
import { createPersonalIntentInput } from "../src/server/model-gateway/personal-intent/contract";
import { createOpenRouterPersonalIntentAdapter } from "../src/server/model-gateway/personal-intent/openrouter-adapter";
import { createPersonalOpenRouterTransport } from "../src/server/model-gateway/personal-intent/openrouter-transport";

const env = process.env;
const incident = env.ENDVERA_BUILD_PERSONAL_INCIDENT_PROBE;
let stage = "CONFIGURATION";
const cases = [
  ["general", "Explique simplement la différence entre le béton 25 MPa et 32 MPa."],
  ["current-sources", "Il annonce cmb demain a mtl"],
  ["calendar-intent", "Ajoute un rendez-vous demain à Montréal."],
  ["calendar-complete", "Ajoute Visite demain à 14:00 jusqu’à 15:00."],
] as const;
async function main() {
  if (env.VERCEL_ENV !== "production" || !incident || !/^20260912-r[1-3]$/u.test(incident)) throw new Error();
  const ingress = inspectPersonalModelIngressConfiguration(readPersonalOperatorConfiguration(env));
  const config = loadAnswerConfiguration(env, false);
  if (!config) throw new Error();
  const subject = { subject: { kind: "personal_assistant_operation" as const, workspaceId: ingress.manifest.workspaceId,
    operationId: `operator-canary:${incident}` }, actorUserId: ingress.manifest.ownerUserId };
  const budget = inspectAnswerBudget(config.rateConfiguration, ANSWER_OPERATION, new Date());
  inspectPersonalModelPilotEnvelope(env, new Date(), budget.ceilingCadMicros, config.pilotEnvelopeReview);
  if (budget.reservationUsdMicros > 100_000n || budget.reservationCadMicros > 200_000n) throw new Error();
  try {
    const policy = twilioDispatchPolicy(env, "sms_outbound", "Vérification technique ENDVERA.");
    console.info(JSON.stringify({ event: "incident.twilio_preflight", ready: true, reservationCadMicros: policy.reservation.toString() }));
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]{1,100}$/u.test(error.message) ? error.message : "UNAVAILABLE";
    console.info(JSON.stringify({ event: "incident.twilio_preflight", ready: false, diagnosticCode: code }));
  }
  for (const [name, body] of cases) {
    if (env.ENDVERA_BUILD_PERSONAL_INCIDENT_CASE === "calendar-intent" && name !== "calendar-intent") continue;
    if (env.ENDVERA_BUILD_PERSONAL_INCIDENT_CASE === "calendar-complete" && name !== "calendar-complete") continue;
    const id = `operator-canary:${incident}:${name}`;
    const receivedAt = new Date().toISOString();
    const intent = name.startsWith("calendar-") ? createPersonalIntentInput(id, body) : null;
    const input = intent ? null : createAnswerInput({ requestId: id, workspaceId: ingress.manifest.workspaceId,
      body, receivedAt, senderVerified: true, workspaceBound: true });
    // These fields are adapter prerequisites only; the evidence below explicitly
    // records OPERATOR_CANARY, never a received SMS or customer action.
    stage = `RESERVE_${name.toUpperCase().replaceAll("-", "_")}`;
    const won = await prisma.$transaction(async tx => {
      const authority = await inspectModelAuthority(tx, subject, new Date());
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS acquired', budget.budgetId);
      if (await tx.constructionAuditEvent.findUnique({ where: { id } })) return false;
      const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantBudget" SET "reservedCadMicros"="reservedCadMicros"+$2,"updatedAt"=(now() AT TIME ZONE 'UTC')
        WHERE id=$1 AND "ceilingCadMicros"=$3 AND "expiresAt"=($4::timestamptz AT TIME ZONE 'UTC')
          AND "expiresAt">(clock_timestamp() AT TIME ZONE 'UTC') AND "reservedCadMicros"+$2<="ceilingCadMicros"`,
        budget.budgetId, budget.reservationCadMicros, budget.ceilingCadMicros, new Date(budget.expiresAt));
      if (changed !== 1) throw new Error();
      const hold = await reserveAccountProviderSpendInTransaction(tx, { operationKey: id, attempt: 1, provider: "openrouter",
        worstCaseMicros: budget.reservationUsdMicros, now: new Date() }, env);
      if (!hold.ok || !hold.created || hold.grantedMicros !== budget.reservationUsdMicros) throw new Error();
      const request = { evidenceKind: "OPERATOR_CANARY", incident, case: name, requestFingerprint: (intent ?? input)!.requestFingerprint,
        accountHoldId: hold.holdId, actionAuthority: false };
      const metadata = { ...request, accountId: authority.accountId, budgetId: budget.budgetId,
        reservedCadMicros: budget.reservationCadMicros.toString(), automaticRetry: false };
      await tx.constructionAuditEvent.create({ data: { id, workspaceId: ingress.manifest.workspaceId,
        actorUserId: ingress.manifest.ownerUserId, entityType: "operator_answer_canary", entityId: id,
        action: "operator_canary.reserved", metadata, fingerprint: canonicalFingerprint({ id, metadata }) } });
      return true;
    }, { isolationLevel: "Serializable", timeout: 8000 });
    if (!won) { console.info(JSON.stringify({ event: "incident.canary", case: name, status: "ALREADY_ATTEMPTED_NO_RETRY" })); continue; }
    const adapterConfig = { enabled: true, allowedModels: budget.allowedModels, providerEndpoints: budget.providerEndpoints,
      timeoutMs: 25_000, maxOutputTokens: budget.maxOutputTokens };
    const getApiKey = async () => {
        const authority = await inspectModelAuthority(prisma, subject, new Date());
        const account = await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { id: authority.accountId } });
        if (!account.credentialRef) throw new Error();
        const row = await prisma.constructionConnectorCredential.findFirstOrThrow({ where: { id: account.credentialRef,
          connectorAccountId: authority.accountId, workspaceId: ingress.manifest.workspaceId, revokedAt: null } });
        const key = requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
        try {
          const binding = JSON.stringify([ingress.manifest.workspaceId, authority.accountId, `openrouter-api-key:${row.id}`]);
          return JSON.parse(openConnectorSecret(row.ciphertext, binding, key)).apiKey as string;
        } finally { key.fill(0); }
      };
    stage = `DISPATCH_${name.toUpperCase().replaceAll("-", "_")}`;
    const signal = new AbortController().signal;
    const result = intent ? await createOpenRouterPersonalIntentAdapter({ enabled: true, modelKey: budget.allowedModels[0],
      providerEndpointSlug: budget.providerEndpoints[0], maxOutputTokens: budget.maxOutputTokens, timeoutMs: 25_000,
      transportMode: "EXTERNAL_PROVIDER", transport: createPersonalOpenRouterTransport({ enabled: true, source: intent,
        modelKey: budget.allowedModels[0], providerEndpointSlug: budget.providerEndpoints[0], maxOutputTokens: budget.maxOutputTokens, getApiKey }, env,
        async (...args) => { const response = await fetch(...args);
          console.info(JSON.stringify({ event: "incident.intent_http", status: response.status })); return response; }),
    }).dispatch(intent, signal) : await createOpenRouterAnswerAdapter(adapterConfig, createAnswerTransport({ enabled: true,
      expectedRequest: answerWireRequest(input!, adapterConfig), getApiKey }, env)).dispatch(input!, signal);
    const evidence = result.status === "ANSWER_INSPECTED"
      ? { status: result.status, providerRequestId: result.providerRequestId, servedModel: result.servedModel,
        usage: result.usage, responseFingerprint: canonicalFingerprint(result), actionAuthority: false }
      : result.status === "PROPOSAL_INSPECTED_NOT_AUTHORIZED"
        ? { status: result.status, providerRequestId: result.providerRequestId, actionKinds: result.inspected.proposal.actions.map(action => action.kind),
          responseFingerprint: canonicalFingerprint(result), actionAuthority: false }
        : { status: result.status, diagnosticCode: safeAdapterReason(result.reason), actionAuthority: false };
    stage = "RECORD_RESULT";
    await prisma.constructionAuditEvent.create({ data: { id: `${id}:result`, workspaceId: ingress.manifest.workspaceId,
      actorUserId: ingress.manifest.ownerUserId, entityType: "operator_answer_canary", entityId: id,
      action: "operator_canary.observed", metadata: { ...evidence, externalTransportPerformed: result.dispatched },
      fingerprint: canonicalFingerprint({ id, evidence }) } });
    console.info(JSON.stringify({ event: "incident.canary", case: name, ...evidence }));
  }
  // Separate, explicitly requested owner-pilot transport check. Not a forged
  // webhook, not an employee recipient, and not an assertion that calendar works.
  if (env.ENDVERA_BUILD_PERSONAL_INCIDENT_SELF_SMS === "20260912-check1") {
    stage = "SELF_SMS";
    const proof = await prisma.constructionAuditEvent.findUnique({ where: { id: "operator-canary:20260912-r1:general:result" } });
    if ((proof?.metadata as { status?: string } | null)?.status !== "ANSWER_INSPECTED") throw new Error();
    const requestId = "868d963b-48a6-4eae-b195-301f2a1be8b3";
    const idempotencyKey = `personal-outbound:${ingress.manifest.workspaceId}:${requestId}`;
    if (await prisma.personalAssistantOperation.findUnique({ where: { idempotencyKey } })) {
      console.info(JSON.stringify({ event: "incident.self_sms", status: "ALREADY_PREPARED_NO_RETRY" })); return;
    }
    // Bind to the identity of the owner's reported incident, not an arbitrary
    // legacy identity in the same test workspace. This does not replay that SMS.
    const incidentSource = await prisma.personalAssistantOperation.findFirstOrThrow({ where: { id: "cmtymu44r0001i904d4t75rrk",
      workspaceId: ingress.manifest.workspaceId, createdByUserId: ingress.manifest.ownerUserId, kind: "personal_sms_inbound" }, select: { request: true } });
    const identityId = (incidentSource.request as { identityId?: unknown }).identityId;
    if (typeof identityId !== "string") throw new Error("INCIDENT_IDENTITY_REQUIRED");
    const identities = await prisma.constructionCommunicationIdentity.findMany({ where: { id: identityId, workspaceId: ingress.manifest.workspaceId,
      userId: ingress.manifest.ownerUserId, channel: "sms", status: "active", verified: true, permissions: { has: "COMMAND" } },
      select: { normalizedAddress: true } });
    if (identities.length !== 1) throw new Error("INCIDENT_IDENTITY_REQUIRED");
    const actor = { userId: ingress.manifest.ownerUserId, workspaceId: ingress.manifest.workspaceId };
    stage = "SELF_SMS_PREPARE";
    const prepared = await preparePersonalOutbound({ ...actor, requestId, kind: "sms_outbound", to: identities[0].normalizedAddress,
      text: "Test technique ENDVERA : OpenRouter répond aux questions générales. La météo et le calendrier sont encore en correction. Ce message vérifie seulement le retour SMS." }, env);
    stage = "SELF_SMS_APPROVE";
    await approvePersonalOutbound({ ...actor, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, env);
    stage = "SELF_SMS_DISPATCH";
    const sent = await dispatchPersonalOutbound(prepared.operationId, env);
    console.info(JSON.stringify({ event: "incident.self_sms", operationId: prepared.operationId, providerSid: sent.providerSid,
      acceptedByProvider: true, deliveryConfirmed: false }));
  }
}
void main().catch(error => {
  const code = error && typeof error === "object" && "code" in error && /^P[0-9]{4}$/u.test(String(error.code)) ? String(error.code) : "UNAVAILABLE";
  const diagnosticCode = error instanceof Error && /^[A-Z_]{1,100}$/u.test(error.message) ? error.message : "UNAVAILABLE";
  console.error(JSON.stringify({ event: "incident.failed", stage, code, diagnosticCode })); process.exitCode = 1;
})
  .finally(() => prisma.$disconnect());
