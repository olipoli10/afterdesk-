import type { Prisma } from "@prisma-client";
import {
  executeControlledSyntheticAttemptSchema,
} from "@/lib/construction-operating-assistant-r37c/contracts";
import {
  canonicalProviderEvidenceSchema,
} from "@/lib/construction-operating-assistant-r37d/contracts";
import { r37aFingerprint } from "@/lib/construction-operating-assistant-r37a/contracts";
import { normalizeSyntheticProviderFixture } from "@/lib/construction-operating-assistant-r37d/normalize";
import {
  controlledProviderDeliveryResultSchema,
  providerFixtureAdapterResultSchema,
  type ControlledProviderDeliveryResult,
  type ProviderFixtureAdapter,
} from "@/lib/construction-operating-assistant-r37f/contracts";
import { prisma } from "@/lib/db";
import { readProviderTrustedNow } from "@/server/construction-operating-assistant-r37b/activation";
import {
  assertCurrentControlledRunAuthority,
  recordControlledRunEvidence,
  executeControlledSyntheticAttempt,
  type ControlledProviderExecutionOptions,
} from "@/server/construction-operating-assistant-r37c/coordinator";

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function recoverCanonicalEvidence(snapshot: Prisma.JsonValue | null, fingerprint: string | null) {
  if (!snapshot && !fingerprint) return null;
  if (!snapshot || !fingerprint) throw new Error("R37F_CANONICAL_EVIDENCE_PAIR_INVALID");
  const evidence = canonicalProviderEvidenceSchema.parse(snapshot);
  const { evidenceFingerprint, ...unsigned } = evidence;
  if (r37aFingerprint(unsigned) !== evidenceFingerprint || evidenceFingerprint !== fingerprint) {
    throw new Error("R37F_CANONICAL_EVIDENCE_FINGERPRINT_DRIFT");
  }
  return evidence;
}

export async function executeControlledSyntheticProviderDelivery(
  rawInput: unknown,
  fixtureAdapter: ProviderFixtureAdapter,
  options: ControlledProviderExecutionOptions = {},
): Promise<ControlledProviderDeliveryResult> {
  const input = executeControlledSyntheticAttemptSchema.parse(rawInput);
  let fixtureAdapterInvoked = false;

  const controlledRun = await executeControlledSyntheticAttempt(input, async (request, context, control) => {
    if (!context) throw new Error("R37F_ACTIVE_LEASE_REQUIRED");
    const leaseCheckNow = readProviderTrustedNow(options.clock);
    const run = await prisma.controlledProviderRun.findFirst({
      where: {
        id: context.runId,
        state: "RUNNING",
        leaseToken: context.leaseToken,
        grantId: input.grantId,
        idempotencyKey: input.idempotencyKey,
        workspaceId: input.workspaceId,
        leaseExpiresAt: { gt: leaseCheckNow },
      },
    });
    const afterLookupNow = readProviderTrustedNow(options.clock);
    if (!run?.leaseExpiresAt || run.leaseExpiresAt <= afterLookupNow) throw new Error("R37F_ACTIVE_LEASE_REQUIRED");

    const current = await assertCurrentControlledRunAuthority(input, context, options.clock);
    if (control?.abortSignal.aborted || current.deadline <= readProviderTrustedNow(options.clock).getTime()) throw new Error("R37F_ACTIVE_LEASE_REQUIRED");

    const recovered = recoverCanonicalEvidence(
      current.run.canonicalEvidenceSnapshot,
      current.run.canonicalEvidenceFingerprint,
    );
    if (recovered) {
      return {
        body: { canonicalEvidenceFingerprint: recovered.evidenceFingerprint },
        latencyMs: recovered.latencyMs,
        costMicros: recovered.costMicros,
        externalTransportPerformed: false,
      };
    }

    fixtureAdapterInvoked = true;
    const adapterResult = providerFixtureAdapterResultSchema.parse(await fixtureAdapter(request));
    const terminal = await assertCurrentControlledRunAuthority(input, context, options.clock);
    const callbackNow = readProviderTrustedNow(options.clock);
    if (control?.abortSignal.aborted || terminal.deadline <= callbackNow.getTime()) throw new Error("R37F_ACTIVE_LEASE_REQUIRED");
    const canonicalEvidence = normalizeSyntheticProviderFixture({
      candidateKey: input.sealed.authorization.candidateKey,
      sealed: input.sealed,
      fixture: adapterResult.fixture,
      latencyMs: adapterResult.latencyMs,
      costMicros: adapterResult.costMicros,
    });
    const stored = await recordControlledRunEvidence(input, context, (tx) => tx.controlledProviderRun.updateMany({
      where: {
        id: run.id,
        state: "RUNNING",
        leaseToken: context.leaseToken,
        leaseExpiresAt: { gt: callbackNow },
        canonicalEvidenceFingerprint: null,
      },
      data: {
        canonicalEvidenceSnapshot: json(canonicalEvidence),
        canonicalEvidenceFingerprint: canonicalEvidence.evidenceFingerprint,
      },
    }), { clock: options.clock, abortSignal: control?.abortSignal });
    if (stored.count !== 1) {
      throw new Error("R37F_ACTIVE_LEASE_REQUIRED");
    }
    return {
      body: { canonicalEvidenceFingerprint: canonicalEvidence.evidenceFingerprint },
      latencyMs: canonicalEvidence.latencyMs,
      costMicros: canonicalEvidence.costMicros,
      externalTransportPerformed: false,
    };
  }, options);

  const durableRun = await prisma.controlledProviderRun.findUniqueOrThrow({
    where: { id: controlledRun.runId },
  });
  const succeeded = controlledRun.disposition === "SUCCEEDED" || controlledRun.disposition === "SUCCEEDED_REPLAY";
  const canonicalEvidence = succeeded
    ? recoverCanonicalEvidence(durableRun.canonicalEvidenceSnapshot, durableRun.canonicalEvidenceFingerprint)
    : null;
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
