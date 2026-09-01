import { describe, expect, it } from "vitest";
import { parseMobileProjectTimeline } from "../src/lib/timeline";

function response(role: "OWNER" | "FIELD_WORKER") {
  const common = {
    schemaVersion: 1 as const,
    generatedAt: "2026-09-01T14:00:00.000Z",
    workspaceId: "workspace-1",
    project: { id: "project-1", code: "LAVAL-001", name: "Rénovation Laval" },
    timezone: "America/Toronto",
    localDate: "2026-09-01",
    role,
    events: [
      {
        id: "evidence:e1",
        kind: "EVIDENCE" as const,
        occurredAt: "2026-09-01T13:00:00.000Z",
        status: "present_unverified",
        summary: "Photo du travail ajoutée",
        detail: "Vérification encore requise",
        provenance: {
          source: "CANONICAL_DATABASE" as const,
          entityType: "ConstructionOpenLoopEvidence",
          entityId: "e1",
        },
      },
    ],
  };
  const commonBrief = {
    appointmentsToday: 0,
    openLoops: 1,
    evidencePendingVerification: 1,
    preparedActions: 0,
    nextResponsibleRoles: ["AUTHORIZED_VERIFIER"],
  };
  return role === "FIELD_WORKER"
    ? { ...common, brief: { ...commonBrief, nextDecision: "CHECK_ASSIGNED_WORK" as const } }
    : {
        ...common,
        brief: {
          ...commonBrief,
          openReceivables: 0,
          outstandingAmountMinor: 0,
          currency: "CAD" as const,
          nextDecision: "OPEN_LOOP_ACTION" as const,
        },
        events: common.events.map((event) => ({ ...event, financial: null })),
      };
}

describe("native R15 timeline parser", () => {
  it("accepts exact owner and field projections", () => {
    expect(parseMobileProjectTimeline(response("OWNER")).role).toBe("OWNER");
    expect(parseMobileProjectTimeline(response("FIELD_WORKER")).role).toBe("FIELD_WORKER");
  });

  it("recursively refuses financial leakage in the field projection", () => {
    const field = response("FIELD_WORKER");
    expect(() => parseMobileProjectTimeline({
      ...field,
      events: field.events.map((event) => ({
        ...event,
        financial: { invoiceReference: "INV-1", outstandingAmountMinor: 120000, currency: "CAD" },
      })),
    })).toThrow("MOBILE_TIMELINE_FIELD_LEAK_REFUSED");
  });

  it("rejects unknown top-level fields and non-canonical provenance", () => {
    expect(() => parseMobileProjectTimeline({ ...response("OWNER"), transcript: "invented" })).toThrow();
    const owner = response("OWNER");
    expect(() => parseMobileProjectTimeline({
      ...owner,
      events: owner.events.map((event) => ({
        ...event,
        provenance: { ...event.provenance, source: "CHAT_TRANSCRIPT" },
      })),
    })).toThrow();
  });
});
