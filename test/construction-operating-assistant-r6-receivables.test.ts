import { describe, expect, it } from "vitest";
import {
  preparedConstructionFollowUpSchema,
  recordConstructionReceivableSchema,
  scheduleConstructionFollowUpSchema,
} from "@/lib/construction-operating-assistant-r6/contracts";

describe("Construction Operating Assistant R6 contracts", () => {
  it("rejects an invoice due before issue and non-CAD money", () => {
    const base = {
      schemaVersion: 1,
      requestId: "r1",
      idempotencyKey: "invoice-184",
      actorId: "owner",
      workspaceId: "workspace",
      projectId: "project",
      contactId: "marc",
      invoiceReference: "184",
      amountMinor: 845_000,
      currency: "CAD",
      issuedAt: "2026-09-01T12:00:00.000Z",
      dueAt: "2026-09-05T12:00:00.000Z",
      sourceRef: "portal:r1",
    } as const;
    expect(recordConstructionReceivableSchema.parse(base)).toEqual(base);
    expect(() => recordConstructionReceivableSchema.parse({ ...base, currency: "USD" })).toThrow();
    expect(() => recordConstructionReceivableSchema.parse({ ...base, dueAt: "2026-08-01T12:00:00.000Z" })).toThrow();
  });

  it("accepts exactly one typed follow-up target", () => {
    const parsed = scheduleConstructionFollowUpSchema.parse({
      schemaVersion: 1,
      requestId: "follow-1",
      idempotencyKey: "follow-1",
      actorId: "owner",
      workspaceId: "workspace",
      projectId: "project",
      contactId: "marc",
      target: { kind: "RECEIVABLE_PAYMENT", receivableId: "invoice" },
      dueAt: "2026-09-05T12:00:00.000Z",
      channel: "SMS",
      body: "Rappel concernant la facture 184.",
    });
    expect(parsed.target.kind).toBe("RECEIVABLE_PAYMENT");
  });

  it("pins prepared actions to zero transport", () => {
    expect(() =>
      preparedConstructionFollowUpSchema.parse({
        schemaVersion: 1,
        disposition: "PREPARED_UNSENT",
        transportAuthorized: true,
        followUpId: "follow",
        workspaceId: "workspace",
        projectId: "project",
        contactId: "marc",
        channel: "SMS",
        body: "Rappel",
        dueAt: "2026-09-05T12:00:00.000Z",
      }),
    ).toThrow();
  });
});
