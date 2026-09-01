import { describe, expect, it } from "vitest";
import {
  unifiedIntentEnvelopeSchema,
  unifiedIntentResultSchema,
  type UnifiedIntentEnvelope,
} from "@/lib/construction-operating-assistant-r18/contracts";
import {
  resolveUnifiedIntent,
  unifiedIntentCanTransition,
} from "@/lib/construction-operating-assistant-r18/resolver";
import type { OperatingInterpreterContext } from "@/lib/construction-operating-assistant-r2/contracts";

const context: OperatingInterpreterContext = {
  referenceNow: "2026-08-31T13:00:00.000Z",
  locale: "fr-CA",
  timezone: "America/Toronto",
  projects: [{ id: "project-laval", code: "LAVAL-001", name: "Rénovation Laval" }],
  contacts: [{ id: "contact-marc", displayName: "Marc", preferredLanguage: "fr-CA" }],
  calendarItems: [],
};

const text = "Rendez-vous avec Marc mardi à 14 h pour Rénovation Laval.";

function envelope(
  source: UnifiedIntentEnvelope["source"],
  mode: UnifiedIntentEnvelope["mode"] = "RESOLVE_ONLY",
): UnifiedIntentEnvelope {
  return unifiedIntentEnvelopeSchema.parse({
    schemaVersion: 1,
    envelopeId: crypto.randomUUID(),
    workspaceId: "workspace-1",
    occurredAt: context.referenceNow,
    mode,
    context: { projectId: null, contactId: null },
    source,
  });
}

describe("R18 unified intent resolution", () => {
  it("resolves equal facts identically across text, transcript and file observation", () => {
    const sources: UnifiedIntentEnvelope["source"][] = [
      { kind: "PORTAL_TEXT", sourceId: crypto.randomUUID(), text },
      {
        kind: "VOICE_TRANSCRIPT",
        sourceId: crypto.randomUUID(),
        transcript: text,
        verificationState: "HUMAN_CONFIRMED",
      },
      {
        kind: "FILE_OBSERVATION",
        sourceId: crypto.randomUUID(),
        evidenceId: "evidence-1",
        observation: text,
        verificationState: "HUMAN_CONFIRMED",
      },
    ];
    const resolutions = sources.map((source) =>
      resolveUnifiedIntent(envelope(source), context, { projectId: null, contactId: null }),
    );
    expect(resolutions.map((value) => ({
      intent: value.intent,
      projectId: value.projectId,
      contactId: value.contactId,
      startsAtUtc: value.startsAtUtc,
      title: value.title,
    }))).toEqual(Array(3).fill({
      intent: "CALENDAR_ITEM_CREATE",
      projectId: "project-laval",
      contactId: "contact-marc",
      startsAtUtc: "2026-09-01T18:00:00.000Z",
      title: "Rendez-vous avec Marc",
    }));
  });

  it("keeps ambiguous time as clarification across confirmed sources", () => {
    const result = resolveUnifiedIntent(envelope({
      kind: "VOICE_TRANSCRIPT",
      sourceId: crypto.randomUUID(),
      transcript: "Rendez-vous avec Marc mardi à 2 pour Rénovation Laval.",
      verificationState: "HUMAN_CONFIRMED",
    }, "APPLY_VALIDATED"), context, { projectId: null, contactId: null });
    expect(result.intent).toBe("CLARIFICATION_REQUIRED");
    expect(result.clarification?.reason).toBe("AMBIGUOUS_TIME");
  });

  it("requires direct input or explicit human confirmation for a transition", () => {
    expect(unifiedIntentCanTransition(envelope({
      kind: "VOICE_TRANSCRIPT",
      sourceId: crypto.randomUUID(),
      transcript: text,
      verificationState: "UNVERIFIED",
    }, "APPLY_VALIDATED"))).toBe(false);
    expect(unifiedIntentCanTransition(envelope({
      kind: "FILE_OBSERVATION",
      sourceId: crypto.randomUUID(),
      evidenceId: "evidence-1",
      observation: text,
      verificationState: "HUMAN_CONFIRMED",
    }, "APPLY_VALIDATED"))).toBe(true);
    expect(unifiedIntentCanTransition(envelope({
      kind: "PORTAL_TEXT",
      sourceId: crypto.randomUUID(),
      text,
    }, "APPLY_VALIDATED"))).toBe(true);
  });

  it("refuses conflicting selected context and unknown response keys", () => {
    const result = resolveUnifiedIntent(envelope({
      kind: "PORTAL_TEXT",
      sourceId: crypto.randomUUID(),
      text,
    }), context, { projectId: "another-project", contactId: null });
    expect(result.intent).toBe("CLARIFICATION_REQUIRED");
    expect(result.clarification?.reason).toBe("AMBIGUOUS_PROJECT");
    expect(() => unifiedIntentResultSchema.parse({ unknown: true })).toThrow();
  });
});
