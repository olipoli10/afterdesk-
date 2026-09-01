import { describe, expect, it } from "vitest";
import {
  CONSTRUCTION_MOBILE_ASSISTANT_API_VERSION,
  constructionMobileAssistantHistorySchema,
  constructionMobileAssistantRequestSchema,
} from "@/lib/construction-operating-assistant-r9/mobile-assistant-contracts";

describe("Construction Operating Assistant R9 mobile contracts", () => {
  it("accepts only the minimum server-attributed request", () => {
    const request = {
      schemaVersion: CONSTRUCTION_MOBILE_ASSISTANT_API_VERSION,
      requestId: "00000000-0000-4000-8000-000000000089",
      workspaceId: "workspace-1",
      message: "Qu'est-ce que j'ai demain?",
      occurredAt: "2026-09-01T13:00:00.000Z",
    };
    expect(constructionMobileAssistantRequestSchema.parse(request)).toEqual(request);
    expect(() => constructionMobileAssistantRequestSchema.parse({ ...request, senderAddress: "user:other" })).toThrow();
    expect(() => constructionMobileAssistantRequestSchema.parse({ ...request, channel: "SMS" })).toThrow();
    expect(() => constructionMobileAssistantRequestSchema.parse({ ...request, provider: "TWILIO" })).toThrow();
  });

  it("rejects history that claims transport or leaks unknown fields", () => {
    const history = {
      schemaVersion: 1,
      generatedAt: "2026-09-01T13:00:00.000Z",
      workspaceId: "workspace-1",
      messages: [],
      externalTransportPerformed: false,
    };
    expect(constructionMobileAssistantHistorySchema.parse(history)).toEqual(history);
    expect(() => constructionMobileAssistantHistorySchema.parse({ ...history, externalTransportPerformed: true })).toThrow();
    expect(() => constructionMobileAssistantHistorySchema.parse({ ...history, rawPhone: "+15555550184" })).toThrow();
  });
});
