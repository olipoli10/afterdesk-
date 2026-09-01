import { describe, expect, it } from "vitest";
import { MobileApi } from "../src/lib/api";
import {
  beginAssistantAttempt,
  createAssistantAttempt,
  finishAssistantAttempt,
  mobileAssistantHistorySchema,
  type MobileAssistantResult,
} from "../src/lib/assistant";
import type { MobileWorkspace } from "../src/lib/contracts";

function workspace(role: "OWNER" | "OFFICE_MANAGER" | "FIELD_WORKER" = "OWNER"): MobileWorkspace {
  const allowed = role !== "FIELD_WORKER";
  return {
    id: "workspace-1",
    name: "ENDVERA Construction",
    defaultTimezone: "America/Toronto",
    defaultLocale: "fr-CA",
    role,
    permissions: {
      financialsVisible: allowed,
      canManageReceivables: allowed,
      canScheduleFollowUps: allowed,
      canApprovePreparedActions: allowed,
      externalTransportAuthorized: false,
    },
  };
}

function result(commandId: string): MobileAssistantResult {
  return {
    schemaVersion: 1,
    commandId,
    messageId: "message-1",
    assistantMessageId: "message-2",
    intent: "AGENDA_QUERY",
    status: "ANSWERED",
    reply: "Vous n’avez rien au calendrier demain.",
    canonicalEffectId: null,
    replayed: false,
    externalTransportPerformed: false,
  };
}

describe("mobile assistant strict contracts", () => {
  it("accepts user-scoped history and rejects unknown or transport fields", () => {
    const history = {
      schemaVersion: 1,
      generatedAt: "2026-09-01T13:00:00.000Z",
      workspaceId: "workspace-1",
      messages: [
        {
          id: "message-1",
          direction: "inbound",
          body: "Qu'est-ce que j'ai demain?",
          status: "interpreted",
          createdAt: "2026-09-01T13:00:00.000Z",
        },
      ],
      externalTransportPerformed: false,
    };
    expect(mobileAssistantHistorySchema.parse(history)).toEqual(history);
    expect(() => mobileAssistantHistorySchema.parse({ ...history, sessionToken: "secret" })).toThrow();
    expect(() => mobileAssistantHistorySchema.parse({ ...history, externalTransportPerformed: true })).toThrow();
  });

  it("refuses field-worker assistant attempts before dispatch", () => {
    expect(() => createAssistantAttempt({ workspace: workspace("FIELD_WORKER"), message: "Agenda" })).toThrow(
      "MOBILE_ASSISTANT_PERMISSION_REFUSED",
    );
  });
});

describe("mobile assistant exact retry", () => {
  it("keeps UUID, message, workspace and timestamp after an unknown outcome", () => {
    const original = createAssistantAttempt({
      workspace: workspace(),
      message: "Texte Marc que je serai 30 minutes en retard.",
      occurredAt: "2026-09-01T13:00:00.000Z",
      idFactory: () => "00000000-0000-4000-8000-000000000089",
    });
    const sending = beginAssistantAttempt(original);
    expect(() => beginAssistantAttempt(sending)).toThrow("MOBILE_ASSISTANT_ALREADY_DISPATCHED");
    const unknown = finishAssistantAttempt(sending, { state: "OUTCOME_UNKNOWN" });
    const retry = beginAssistantAttempt(unknown);
    expect(retry.request).toEqual(original.request);
  });

  it("refuses a successful response with the wrong command id or external transport", async () => {
    const attempt = createAssistantAttempt({
      workspace: workspace(),
      message: "Qu'est-ce que j'ai demain?",
      idFactory: () => "00000000-0000-4000-8000-000000000089",
    });
    const wrongIdApi = new MobileApi({
      baseUrl: "http://127.0.0.1:3000",
      getCookie: () => "better-auth.session_token=synthetic",
      fetchImpl: async () => new Response(JSON.stringify(result("00000000-0000-4000-8000-000000000090"))),
    });
    await expect(wrongIdApi.assistant(attempt.request)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    const transportApi = new MobileApi({
      baseUrl: "http://127.0.0.1:3000",
      getCookie: () => "better-auth.session_token=synthetic",
      fetchImpl: async () => new Response(JSON.stringify({ ...result(attempt.request.requestId), externalTransportPerformed: true })),
    });
    await expect(transportApi.assistant(attempt.request)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
