import { describe, expect, it } from "vitest";
import {
  CONSTRUCTION_SHARED_API_VERSION,
  constructionCockpitQuerySchema,
  constructionSharedApiCommandSchema,
} from "@/lib/construction-operating-assistant-r7/api-contracts";
import {
  CONSTRUCTION_COMMAND_MAX_BYTES,
  parseConstructionCommandRequest,
} from "@/lib/construction-operating-assistant-r7/http";

const validCommand = {
  schemaVersion: 1,
  requestId: "request-1",
  type: "RECORD_RECEIVABLE",
  payload: {
    idempotencyKey: "invoice-184",
    workspaceId: "workspace-1",
    projectId: "project-1",
    contactId: "contact-1",
    invoiceReference: "184",
    amountMinor: 845_000,
    currency: "CAD",
    issuedAt: "2026-09-01T12:00:00.000Z",
    dueAt: "2026-09-08T12:00:00.000Z",
    sourceRef: "synthetic:invoice-184",
  },
} as const;

describe("Construction Operating Assistant R7 shared API contract", () => {
  it("accepts one strict versioned command without actor identity", () => {
    expect(CONSTRUCTION_SHARED_API_VERSION).toBe(1);
    expect(constructionSharedApiCommandSchema.parse(validCommand)).toEqual(
      validCommand,
    );
  });

  it("refuses client-controlled actor identity and unknown fields", () => {
    expect(
      constructionSharedApiCommandSchema.safeParse({
        ...validCommand,
        actorId: "attacker",
      }).success,
    ).toBe(false);
    expect(
      constructionSharedApiCommandSchema.safeParse({
        ...validCommand,
        payload: { ...validCommand.payload, actorId: "attacker" },
      }).success,
    ).toBe(false);
  });

  it("refuses invalid dates, versions and cockpit query fields", () => {
    expect(
      constructionSharedApiCommandSchema.safeParse({
        ...validCommand,
        schemaVersion: 2,
      }).success,
    ).toBe(false);
    expect(
      constructionSharedApiCommandSchema.safeParse({
        ...validCommand,
        payload: {
          ...validCommand.payload,
          dueAt: "2026-08-01T12:00:00.000Z",
        },
      }).success,
    ).toBe(false);
    expect(
      constructionCockpitQuerySchema.safeParse({
        workspaceId: "workspace-1",
        role: "OWNER",
      }).success,
    ).toBe(false);
  });

  it("enforces JSON and a bounded HTTP payload before command dispatch", async () => {
    await expect(
      parseConstructionCommandRequest(
        new Request("http://localhost/api", {
          method: "POST",
          body: JSON.stringify(validCommand),
          headers: { "content-type": "text/plain" },
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });

    await expect(
      parseConstructionCommandRequest(
        new Request("http://localhost/api", {
          method: "POST",
          body: "x".repeat(CONSTRUCTION_COMMAND_MAX_BYTES + 1),
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });

    await expect(
      parseConstructionCommandRequest(
        new Request("http://localhost/api", {
          method: "POST",
          body: "{",
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      parseConstructionCommandRequest(
        new Request("http://localhost/api", {
          method: "POST",
          body: JSON.stringify(validCommand),
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      ),
    ).resolves.toEqual(validCommand);
  });
});
