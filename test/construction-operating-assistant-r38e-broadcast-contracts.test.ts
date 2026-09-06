import { describe, expect, it } from "vitest";
import {
  buildSecretaryBroadcastRequestHash,
  maskSecretaryBroadcastDestination,
  parseSecretaryBroadcastCommand,
  secretaryBroadcastCockpitSchema,
} from "@/lib/construction-operating-assistant-r38e/contracts";

describe("R38E secretary broadcast contracts", () => {
  it("parses two to ten ordered recipients and an exact body", () => {
    expect(parseSecretaryBroadcastCommand("Texte Marc et Julie que le chantier ouvre à 7 h.")).toEqual({
      kind: "CANDIDATE",
      recipientNames: ["Marc", "Julie"],
      body: "le chantier ouvre à 7 h.",
    });

    expect(
      parseSecretaryBroadcastCommand(
        "Envoie un texto à A, B, C, D, E, F, G, H, I et J que réunion déplacée à midi",
      ),
    ).toMatchObject({
      kind: "CANDIDATE",
      recipientNames: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
      body: "réunion déplacée à midi",
    });
  });

  it("leaves single-recipient commands to the existing assistant path", () => {
    expect(parseSecretaryBroadcastCommand("Texte Marc que le rendez-vous est confirmé.")).toEqual({
      kind: "NOT_BROADCAST",
    });
  });

  it("refuses malformed, duplicate and oversized broadcast audiences", () => {
    expect(parseSecretaryBroadcastCommand("Texte Marc et Julie")).toEqual({
      kind: "REFUSED",
      reasonCode: "R38E_MESSAGE_REQUIRED",
    });
    expect(parseSecretaryBroadcastCommand("Texte Marc, Julie et marc que bonjour")).toEqual({
      kind: "REFUSED",
      reasonCode: "R38E_DUPLICATE_RECIPIENT",
    });
    expect(
      parseSecretaryBroadcastCommand("Texte A, B, C, D, E, F, G, H, I, J et K que bonjour"),
    ).toEqual({ kind: "REFUSED", reasonCode: "R38E_TOO_MANY_RECIPIENTS" });
  });

  it("builds a stable hash that changes when order or content changes", () => {
    const first = buildSecretaryBroadcastRequestHash({
      recipientNames: ["Marc", "Julie"],
      body: "Le chantier ouvre à 7 h.",
    });
    expect(first).toBe(
      buildSecretaryBroadcastRequestHash({
        recipientNames: ["Marc", "Julie"],
        body: "Le chantier ouvre à 7 h.",
      }),
    );
    expect(first).not.toBe(
      buildSecretaryBroadcastRequestHash({
        recipientNames: ["Julie", "Marc"],
        body: "Le chantier ouvre à 7 h.",
      }),
    );
    expect(first).not.toBe(
      buildSecretaryBroadcastRequestHash({
        recipientNames: ["Marc", "Julie"],
        body: "Le chantier ouvre à 8 h.",
      }),
    );
  });

  it("masks manager destinations and rejects field-worker detail leakage", () => {
    expect(maskSecretaryBroadcastDestination("+15145551234")).toBe("••• ••• 1234");
    const base = {
      schemaVersion: 1 as const,
      workspaceId: "workspace-1",
      externalTransportEnabled: false as const,
    };
    expect(secretaryBroadcastCockpitSchema.parse({
      ...base,
      role: "field_worker",
      drafts: [{
        id: "draft-1",
        visibility: "REDACTED",
        status: "PREPARED_UNSENT",
        version: 1,
        recipientCount: 2,
        preparedAt: "2026-09-06T00:00:00.000Z",
        externalTransportPerformed: false,
      }],
    }).drafts[0]).toMatchObject({ visibility: "REDACTED", recipientCount: 2 });

    expect(() => secretaryBroadcastCockpitSchema.parse({
      ...base,
      role: "field_worker",
      drafts: [{
        id: "draft-1",
        visibility: "FULL",
        status: "PREPARED_UNSENT",
        version: 1,
        recipientCount: 2,
        preparedAt: "2026-09-06T00:00:00.000Z",
        externalTransportPerformed: false,
        payloadHash: "a".repeat(64),
        body: "Bonjour",
        recipients: [
          { displayName: "Marc", maskedDestination: "••• ••• 1234" },
          { displayName: "Julie", maskedDestination: "••• ••• 5678" },
        ],
      }],
    })).toThrow("R38E_FIELD_WORKER_DETAILS_FORBIDDEN");
  });
});
