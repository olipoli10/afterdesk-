import { describe, expect, it } from "vitest";
import { unifiedIntentResultSchema } from "@/lib/construction-operating-assistant-r18/contracts";
import { unifiedIntentRoutingChannel } from "@/server/construction-operating-assistant-r18/unified-intent";

describe("R36E context-rich intent routing gate", () => {
  it.each([
    ["PORTAL_TEXT", "PORTAL"],
    ["FILE_OBSERVATION", "PORTAL"],
    ["VOICE_TRANSCRIPT", "VOICE_TRANSCRIPT"],
    ["EMAIL_MESSAGE", "EMAIL"],
  ] as const)("maps %s to %s", (sourceKind, channel) => {
    expect(unifiedIntentRoutingChannel(sourceKind)).toBe(channel);
  });

  it("accepts only the provider-neutral optional routing projection", () => {
    const result = {
      schemaVersion: 1,
      envelopeId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "workspace-r36e",
      interpretation: {
        schemaVersion: 2,
        intent: "UNSUPPORTED",
        confidence: 1,
        language: "fr",
        timezone: "America/Toronto",
        projectId: null,
        contactId: null,
        calendarItemId: null,
        startsAtUtc: null,
        endsAtUtc: null,
        dueAtUtc: null,
        title: null,
        approvalRequired: false,
        queryWindow: null,
        clarification: null,
        legacy: null,
      },
      status: "REFUSED",
      reply: "Non exécuté.",
      refusalReason: "PROVIDER_REQUIRED_NOT_AUTHORIZED",
      transition: {
        requested: true,
        validated: true,
        performed: false,
        canonicalCommandId: null,
        canonicalEffectId: null,
        replayed: false,
      },
      provenance: {
        sourceKind: "VOICE_TRANSCRIPT",
        sourceId: "22222222-2222-4222-8222-222222222222",
        suppliedByUserId: "owner-r36e",
        occurredAt: "2026-09-02T16:00:00.000Z",
        bodySha256: "a".repeat(64),
        evidenceId: null,
        verificationState: "HUMAN_CONFIRMED",
      },
      routing: {
        schemaVersion: 1,
        intentClass: "PUBLIC_WEB_RESEARCH",
        capabilityKey: "WEB_RESEARCH",
        disposition: "CANDIDATE_PREPARED",
        readiness: "PROVIDER_REQUIRED_NOT_AUTHORIZED",
        citationsRequired: true,
        approvalRequired: false,
        providerExecutionAuthorized: false,
        externalDispatchPerformed: false,
      },
      externalTransportPerformed: false,
    } as const;
    expect(unifiedIntentResultSchema.parse(result)).toEqual(result);
    expect(() => unifiedIntentResultSchema.parse({
      ...result,
      routing: { ...result.routing, modelKey: "hidden-model" },
    })).toThrow();
  });
});
