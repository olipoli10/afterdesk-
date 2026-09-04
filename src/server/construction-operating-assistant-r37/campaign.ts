import { prisma } from "@/lib/db";
import { R37_CASES } from "@/lib/construction-operating-assistant-r37/cases";
import {
  R37_ATTEMPT_RESERVATION_MICROS,
  R37_MODELS,
  assertExchangeCeiling,
  r37CampaignReportSchema,
  r37Fingerprint,
} from "@/lib/construction-operating-assistant-r37/contracts";
import {
  dispatchOpenRouterRequest,
  hasLocalOpenRouterCredential,
} from "@/lib/construction-operating-assistant-r37/transport";
import { evaluateR37Case } from "@/lib/construction-operating-assistant-r37/oracle";
import {
  activateProviderActivationGrant,
  prepareProviderActivationGrant,
  reserveProviderSpend,
  revokeProviderActivationGrant,
  setProviderLaneControl,
  settleProviderSpend,
} from "@/server/construction-operating-assistant-r37b/activation";

type ModelId = (typeof R37_MODELS)[number];
type ObservedCase = (typeof R37_CASES)[number];
type TransportResult = Awaited<ReturnType<typeof dispatchOpenRouterRequest>>;

export type R37CampaignInput = Readonly<{
  campaignId: string;
  ownerId: string;
  adminId: string;
  workspaceId: string;
  transport?: (input: { modelId: ModelId; observedCase: ObservedCase }) => Promise<TransportResult>;
  writeAttemptEvidence: (evidence: Record<string, unknown>) => Promise<void>;
  now?: () => Date;
}>;

function errorCode(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "R37_UNKNOWN_FAILURE";
  return /^R37[A-Z0-9_:-]*$/u.test(message) ? message : "R37_PROVIDER_ATTEMPT_FAILED";
}

async function currentLaneVersion() {
  return (await prisma.providerLaneControl.findUnique({
    where: { id: "provider-lane-global" },
    select: { version: true, state: true },
  })) ?? { version: 0, state: "DISABLED" };
}

export async function runR37OpenRouterCampaign(input: R37CampaignInput) {
  const trustedNow = input.now?.() ?? new Date();
  assertExchangeCeiling(trustedNow);
  if (!input.transport && !hasLocalOpenRouterCredential()) {
    throw new Error("R37_CREDENTIAL_REQUIRED");
  }
  const existing = await prisma.providerActivationGrant.count({
    where: { workspaceId: input.workspaceId, exactModelId: { in: [...R37_MODELS] } },
  });
  if (existing > 0) throw new Error("R37_AMBIGUOUS_PRIOR_CAMPAIGN");

  const initialLane = await currentLaneVersion();
  if (initialLane.state === "ENABLED") throw new Error("R37_PROVIDER_LANE_ALREADY_ENABLED");

  const transport = input.transport ?? ((request) => dispatchOpenRouterRequest(request));
  const clock = { now: () => new Date(trustedNow.getTime()) };
  const grants: Array<{ id: string; modelId: ModelId }> = [];
  const observations: Array<Record<string, unknown>> = [];
  const failureCodes: string[] = [];
  let dispatchedCallCount = 0;
  let settledSpendMicros = 0n;
  let grantsRevoked = false;
  let providerLaneDisabled = false;

  try {
    await setProviderLaneControl({
      commandId: crypto.randomUUID(),
      actorId: input.adminId,
      state: "ENABLED",
      reason: `R37 OpenRouter synthetic campaign ${input.campaignId}`,
      expectedVersion: initialLane.version,
    }, clock);

    const sealedExecutorFingerprint = r37Fingerprint({
      campaignId: input.campaignId,
      provider: "OPENROUTER",
      models: R37_MODELS,
      caseFingerprints: R37_CASES.map((item) => item.caseFingerprint),
      attemptReservationMicros: R37_ATTEMPT_RESERVATION_MICROS.toString(),
    });

    for (const modelId of R37_MODELS) {
      const prepared = await prepareProviderActivationGrant({
        commandId: crypto.randomUUID(),
        actorId: input.ownerId,
        workspaceId: input.workspaceId,
        candidateKey: "OPENROUTER_CONTROLLER",
        exactModelId: modelId,
        sealedExecutorFingerprint,
        allowedCaseFingerprints: R37_CASES.map((item) => item.caseFingerprint),
        expiresAt: new Date(trustedNow.getTime() + 15 * 60 * 1_000),
        maxCallCount: R37_CASES.length,
        maxTotalSpendMicros: R37_ATTEMPT_RESERVATION_MICROS * BigInt(R37_CASES.length),
      }, clock);
      grants.push({ id: prepared.grant.id, modelId });
      await activateProviderActivationGrant({
        commandId: crypto.randomUUID(),
        actorId: input.ownerId,
        workspaceId: input.workspaceId,
        grantId: prepared.grant.id,
        expectedVersion: 1,
        sealedExecutorFingerprint,
      }, clock);
    }

    outer: for (const grant of grants) {
      for (const observedCase of R37_CASES) {
        const reservation = await reserveProviderSpend({
          actorId: input.ownerId,
          workspaceId: input.workspaceId,
          grantId: grant.id,
          idempotencyKey: `${input.campaignId}:${grant.modelId}:${observedCase.caseId}`,
          caseFingerprint: observedCase.caseFingerprint,
          exactModelId: grant.modelId,
          sealedExecutorFingerprint,
          requestedMicros: R37_ATTEMPT_RESERVATION_MICROS,
        }, clock);
        if (reservation.replayed) {
          failureCodes.push("R37_AMBIGUOUS_PRIOR_DISPATCH");
          break outer;
        }

        dispatchedCallCount += 1;
        let providerResult: TransportResult;
        try {
          providerResult = await transport({ modelId: grant.modelId, observedCase });
        } catch (cause) {
          failureCodes.push(errorCode(cause));
          break outer;
        }

        const oracle = evaluateR37Case(observedCase, providerResult.output);
        const evidence = {
          schemaVersion: 1,
          campaignId: input.campaignId,
          provider: "OPENROUTER",
          modelId: grant.modelId,
          caseId: observedCase.caseId,
          caseFingerprint: observedCase.caseFingerprint,
          responseId: providerResult.responseId,
          responseFingerprint: providerResult.responseFingerprint,
          usage: providerResult.usage,
          costMicros: providerResult.costMicros.toString(),
          latencyMs: providerResult.latencyMs,
          output: providerResult.output,
          oracle,
          evidenceLabel: "OBSERVED_PROVIDER_SYNTHETIC_INPUT",
        };
        try {
          await input.writeAttemptEvidence(evidence);
        } catch {
          failureCodes.push("R37_ATTEMPT_EVIDENCE_WRITE_FAILED");
          break outer;
        }
        await settleProviderSpend({
          commandId: crypto.randomUUID(),
          actorId: input.ownerId,
          workspaceId: input.workspaceId,
          grantId: grant.id,
          attemptId: reservation.attempt.id,
          expectedVersion: 1,
          settledMicros: providerResult.costMicros,
        }, clock);
        settledSpendMicros += providerResult.costMicros;
        observations.push(evidence);
        if (!oracle.passed) {
          failureCodes.push(...oracle.reasonCodes);
          break outer;
        }
      }
    }
  } catch (cause) {
    failureCodes.push(errorCode(cause));
  } finally {
    for (const grant of grants) {
      try {
        const current = await prisma.providerActivationGrant.findUnique({
          where: { id: grant.id },
          select: { version: true, status: true },
        });
        if (current && current.status !== "REVOKED") {
          await revokeProviderActivationGrant({
            commandId: crypto.randomUUID(),
            actorId: input.ownerId,
            workspaceId: input.workspaceId,
            grantId: grant.id,
            expectedVersion: current.version,
            reason: `R37 campaign ${input.campaignId} closed`,
          }, clock);
        }
      } catch {
        failureCodes.push("R37_GRANT_REVOCATION_FAILED");
      }
    }
    grantsRevoked = grants.length === R37_MODELS.length && await prisma.providerActivationGrant.count({
      where: { workspaceId: input.workspaceId, id: { in: grants.map((item) => item.id) }, status: "REVOKED" },
    }) === grants.length;
    try {
      const lane = await currentLaneVersion();
      if (lane.state !== "DISABLED") {
        await setProviderLaneControl({
          commandId: crypto.randomUUID(),
          actorId: input.adminId,
          state: "DISABLED",
          reason: `R37 campaign ${input.campaignId} closed`,
          expectedVersion: lane.version,
        }, clock);
      }
      providerLaneDisabled = (await currentLaneVersion()).state === "DISABLED";
    } catch {
      failureCodes.push("R37_PROVIDER_LANE_DISABLE_FAILED");
    }
  }

  const complete = observations.length === R37_MODELS.length * R37_CASES.length;
  const allOraclePass = complete && observations.every((item) =>
    (item.oracle as { passed: boolean }).passed,
  );
  const cleanFailures = [...new Set(failureCodes)].sort();
  const verdict = complete && allOraclePass && cleanFailures.length === 0 && grantsRevoked && providerLaneDisabled
    ? "OPENROUTER_SANDBOX_OBSERVED_PASS"
    : "REWORK";
  const totalsByModel = R37_MODELS.map((modelId) => ({
    modelId,
    costMicros: observations
      .filter((item) => item.modelId === modelId)
      .reduce((sum, item) => sum + BigInt(String(item.costMicros)), 0n),
  }));
  const selectedCandidate = verdict === "OPENROUTER_SANDBOX_OBSERVED_PASS"
    ? [...totalsByModel].sort((left, right) =>
      left.costMicros === right.costMicros
        ? left.modelId.localeCompare(right.modelId)
        : left.costMicros < right.costMicros ? -1 : 1,
    )[0]?.modelId ?? null
    : null;

  return r37CampaignReportSchema.parse({
    schemaVersion: 1,
    campaignId: input.campaignId,
    provider: "OPENROUTER" as const,
    evidenceLabel: "OBSERVED_PROVIDER_SYNTHETIC_INPUT" as const,
    expectedCallCount: R37_MODELS.length * R37_CASES.length,
    dispatchedCallCount,
    canonicalObservationCount: observations.length,
    replayedDispatchCount: 0,
    settledSpendMicros: settledSpendMicros.toString(),
    founderCeilingCadMicros: "10000000",
    applicationCeilingUsdMicros: "5000000",
    observations,
    selectedR38Candidate: selectedCandidate,
    failureCodes: cleanFailures,
    grantsRevoked,
    providerLaneDisabled,
    externalCommunicationPerformed: false as const,
    externalToolWritePerformed: false as const,
    deploymentPerformed: false as const,
    verdict,
  });
}
