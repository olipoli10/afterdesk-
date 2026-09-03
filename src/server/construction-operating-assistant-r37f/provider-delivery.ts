import type { Prisma } from "@prisma-client";
import {
  executeControlledSyntheticAttemptSchema,
} from "@/lib/construction-operating-assistant-r37c/contracts";
import {
  canonicalProviderEvidenceSchema,
} from "@/lib/construction-operating-assistant-r37d/contracts";
import { normalizeSyntheticProviderFixture } from "@/lib/construction-operating-assistant-r37d/normalize";
import {
  controlledProviderDeliveryResultSchema,
  providerFixtureAdapterResultSchema,
  type ControlledProviderDeliveryResult,
  type ProviderFixtureAdapter,
} from "@/lib/construction-operating-assistant-r37f/contracts";
import { prisma } from "@/lib/db";
import { executeControlledSyntheticAttempt } from "@/server/construction-operating-assistant-r37c/coordinator";

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function recoverCanonicalEvidence(snapshot: Prisma.JsonValue | null, fingerprint: string | null) {
  if (!snapshot && !fingerprint) return null;
  if (!snapshot || !fingerprint) throw new Error("R37F_CANONICAL_EVIDENCE_PAIR_INVALID");
  const evidence = canonicalProviderEvidenceSchema.parse(snapshot);
  if (evidence.evidenceFingerprint !== fingerprint) {
    throw new Error("R37F_CANONICAL_EVIDENCE_FINGERPRINT_DRIFT");
  }
  return evidence;
}

export async function executeControlledSyntheticProviderDelivery(
  rawInput: unknown,
  fixtureAdapter: ProviderFixtureAdapter,
): Promise<ControlledProviderDeliveryResult> {
  const input = executeControlledSyntheticAttemptSchema.parse(rawInput);
  let fixtureAdapterInvoked = false;

  const controlledRun = await executeControlledSyntheticAttempt(input, async (request) => {
    const run = await prisma.controlledProviderRun.findUnique({
      where: {
        grantId_idempotencyKey: {
          grantId: input.grantId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (!run || run.state !== "RUNNING") throw new Error("R37F_ACTIVE_LEASE_REQUIRED");

    const recovered = recoverCanonicalEvidence(
      run.canonicalEvidenceSnapshot,
      run.canonicalEvidenceFingerprint,
    );
    if (recovered) {
      return {
        body: recovered,
        latencyMs: recovered.latencyMs,
        costMicros: recovered.costMicros,
        externalTransportPerformed: false,
      };
    }

    fixtureAdapterInvoked = true;
    const adapterResult = providerFixtureAdapterResultSchema.parse(await fixtureAdapter(request));
    const canonicalEvidence = normalizeSyntheticProviderFixture({
      candidateKey: input.sealed.authorization.candidateKey,
      sealed: input.sealed,
      fixture: adapterResult.fixture,
      latencyMs: adapterResult.latencyMs,
      costMicros: adapterResult.costMicros,
    });
    const stored = await prisma.controlledProviderRun.updateMany({
      where: {
        id: run.id,
        state: "RUNNING",
        canonicalEvidenceFingerprint: null,
      },
      data: {
        canonicalEvidenceSnapshot: json(canonicalEvidence),
        canonicalEvidenceFingerprint: canonicalEvidence.evidenceFingerprint,
      },
    });
    if (stored.count !== 1) {
      const concurrent = await prisma.controlledProviderRun.findUniqueOrThrow({ where: { id: run.id } });
      const concurrentEvidence = recoverCanonicalEvidence(
        concurrent.canonicalEvidenceSnapshot,
        concurrent.canonicalEvidenceFingerprint,
      );
      if (!concurrentEvidence) throw new Error("R37F_CANONICAL_EVIDENCE_RECORD_FAILED");
      return {
        body: concurrentEvidence,
        latencyMs: concurrentEvidence.latencyMs,
        costMicros: concurrentEvidence.costMicros,
        externalTransportPerformed: false,
      };
    }
    return {
      body: canonicalEvidence,
      latencyMs: canonicalEvidence.latencyMs,
      costMicros: canonicalEvidence.costMicros,
      externalTransportPerformed: false,
    };
  });

  const durableRun = await prisma.controlledProviderRun.findUniqueOrThrow({
    where: { id: controlledRun.runId },
  });
  const canonicalEvidence = recoverCanonicalEvidence(
    durableRun.canonicalEvidenceSnapshot,
    durableRun.canonicalEvidenceFingerprint,
  );
  if (controlledRun.disposition.startsWith("SUCCEEDED") && !canonicalEvidence) {
    throw new Error("R37F_SUCCESS_WITHOUT_CANONICAL_EVIDENCE");
  }

  return controlledProviderDeliveryResultSchema.parse({
    controlledRun,
    canonicalEvidence,
    fixtureAdapterInvoked,
    externalTransportPerformed: false,
  });
}
