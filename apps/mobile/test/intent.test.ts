import { describe, expect, it } from "vitest";
import { MobileApi, MobileApiError } from "@/lib/api";
import {
  createPortalIntentEnvelope,
  mobileUnifiedIntentEnvelopeSchema,
} from "@/lib/intent";

const workspace = {
  id: "workspace-1",
  name: "ENDVERA Construction",
  defaultTimezone: "America/Toronto",
  defaultLocale: "fr-CA",
  role: "OWNER" as const,
  permissions: {
    financialsVisible: true,
    canManageReceivables: true,
    canScheduleFollowUps: true,
    canApprovePreparedActions: true,
    canAddEvidence: true,
    externalTransportAuthorized: false as const,
  },
};

describe("R18 mobile unified intent contract", () => {
  it("creates strict stable source and envelope identifiers", () => {
    const ids = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
    ];
    const envelope = createPortalIntentEnvelope({
      workspace,
      text: "Rendez-vous avec Marc mardi à 14 h pour Laval.",
      mode: "APPLY_VALIDATED",
      occurredAt: "2026-09-01T13:00:00.000Z",
      idFactory: () => ids.shift()!,
    });
    expect(envelope.source.sourceId).toBe("10000000-0000-4000-8000-000000000001");
    expect(envelope.envelopeId).toBe("10000000-0000-4000-8000-000000000002");
    expect(Object.isFrozen(envelope)).toBe(false);
  });

  it("refuses field workers and unknown envelope keys", () => {
    expect(() => createPortalIntentEnvelope({
      workspace: {
        ...workspace,
        role: "FIELD_WORKER",
        permissions: {
          ...workspace.permissions,
          financialsVisible: false,
          canManageReceivables: false,
          canScheduleFollowUps: false,
          canApprovePreparedActions: false,
        },
      },
      text: "Qu’est-ce que j’ai demain?",
      mode: "RESOLVE_ONLY",
    })).toThrow("MOBILE_INTENT_PERMISSION_REFUSED");
    expect(() => mobileUnifiedIntentEnvelopeSchema.parse({
      schemaVersion: 1,
      envelopeId: "10000000-0000-4000-8000-000000000002",
      workspaceId: workspace.id,
      occurredAt: "2026-09-01T13:00:00.000Z",
      mode: "RESOLVE_ONLY",
      context: { projectId: null, contactId: null },
      source: {
        kind: "PORTAL_TEXT",
        sourceId: "10000000-0000-4000-8000-000000000001",
        text: "Qu’est-ce que j’ai demain?",
      },
      invented: true,
    })).toThrow();
  });

  it("rejects a response bound to another envelope", async () => {
    const envelope = createPortalIntentEnvelope({
      workspace,
      text: "Qu’est-ce que j’ai demain?",
      mode: "RESOLVE_ONLY",
      occurredAt: "2026-09-01T13:00:00.000Z",
      idFactory: (() => {
        const ids = [
          "10000000-0000-4000-8000-000000000001",
          "10000000-0000-4000-8000-000000000002",
        ];
        return () => ids.shift()!;
      })(),
    });
    const api = new MobileApi({
      baseUrl: "https://local.invalid",
      getCookie: () => "session=synthetic",
      fetchImpl: async () => new Response(JSON.stringify({
        schemaVersion: 1,
        envelopeId: "10000000-0000-4000-8000-000000000099",
      }), { status: 200 }),
    });
    await expect(api.unifiedIntent(envelope)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    } satisfies Partial<MobileApiError>);
  });
});
