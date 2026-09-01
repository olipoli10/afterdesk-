import { describe, expect, it } from "vitest";
import {
  fieldProjectTimelineSchema,
  localDateKey,
  orderTimelineEvents,
  ownerProjectTimelineSchema,
} from "@/lib/construction-operating-assistant-r15/timeline";

const base = {
  schemaVersion: 1 as const,
  generatedAt: "2026-09-01T14:00:00.000Z",
  workspaceId: "workspace-1",
  project: { id: "project-1", code: "LAVAL-001", name: "Rénovation Laval" },
  timezone: "America/Toronto",
  localDate: "2026-09-01",
};

describe("R15 deterministic project timeline contracts", () => {
  it("orders newest first and uses stable kind/id tie breakers", () => {
    const events = [
      { id: "b", kind: "OPEN_LOOP", occurredAt: "2026-09-01T12:00:00.000Z" },
      { id: "a", kind: "ACTION", occurredAt: "2026-09-01T12:00:00.000Z" },
      { id: "c", kind: "EVIDENCE", occurredAt: "2026-09-02T12:00:00.000Z" },
    ];
    expect(orderTimelineEvents(events).map((event) => event.id)).toEqual(["c", "a", "b"]);
    expect(events.map((event) => event.id)).toEqual(["b", "a", "c"]);
  });

  it("derives the operating day in the canonical workspace timezone", () => {
    expect(localDateKey(new Date("2026-09-02T02:00:00.000Z"), "America/Toronto")).toBe(
      "2026-09-01",
    );
  });

  it("requires financial detail for an owner receivable event", () => {
    const owner = {
      ...base,
      role: "OWNER" as const,
      brief: {
        appointmentsToday: 0,
        openLoops: 0,
        evidencePendingVerification: 0,
        preparedActions: 0,
        nextResponsibleRoles: [],
        openReceivables: 1,
        outstandingAmountMinor: 120000,
        currency: "CAD" as const,
        nextDecision: "FOLLOW_UP_RECEIVABLE" as const,
      },
      events: [
        {
          id: "receivable:r1",
          kind: "RECEIVABLE" as const,
          occurredAt: "2026-09-01T12:00:00.000Z",
          status: "open",
          summary: "Compte à recevoir INV-1",
          detail: null,
          provenance: {
            source: "CANONICAL_DATABASE" as const,
            entityType: "ConstructionReceivable" as const,
            entityId: "r1",
          },
          financial: {
            invoiceReference: "INV-1",
            outstandingAmountMinor: 120000,
            currency: "CAD" as const,
          },
        },
      ],
    };
    expect(ownerProjectTimelineSchema.parse(owner)).toEqual(owner);
  });

  it("refuses financial and unknown keys in the field contract", () => {
    const field = {
      ...base,
      role: "FIELD_WORKER" as const,
      brief: {
        appointmentsToday: 0,
        openLoops: 1,
        evidencePendingVerification: 1,
        preparedActions: 0,
        nextResponsibleRoles: ["ASSIGNED_FIELD_ROLE"],
        nextDecision: "CHECK_ASSIGNED_WORK" as const,
      },
      events: [],
    };
    expect(fieldProjectTimelineSchema.parse(field)).toEqual(field);
    expect(() => fieldProjectTimelineSchema.parse({
      ...field,
      brief: { ...field.brief, outstandingAmountMinor: 120000 },
    })).toThrow();
  });
});
