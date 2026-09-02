import { describe, expect, it } from "vitest";
import { mobileAssistantResultSchema } from "../src/lib/assistant";

const result = {
  schemaVersion: 1,
  commandId: "11111111-1111-4111-8111-111111111111",
  messageId: "message-1",
  assistantMessageId: "message-2",
  intent: "UNSUPPORTED",
  status: "REFUSED",
  reply: "Aucune recherche n’a été exécutée.",
  canonicalEffectId: null,
  replayed: false,
  externalTransportPerformed: false,
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
} as const;

describe("mobile unified assistant routing", () => {
  it("accepts provider-neutral readiness", () => {
    expect(mobileAssistantResultSchema.parse(result)).toEqual(result);
  });

  it.each(["provider", "modelKey", "routeKey", "adapterKey", "estimatedCostMicros"])(
    "rejects leaked routing field %s",
    (key) => {
      expect(() => mobileAssistantResultSchema.parse({
        ...result,
        routing: { ...result.routing, [key]: "leak" },
      })).toThrow();
    },
  );

  it("rejects any claimed external execution", () => {
    expect(() => mobileAssistantResultSchema.parse({
      ...result,
      routing: { ...result.routing, providerExecutionAuthorized: true },
    })).toThrow();
    expect(() => mobileAssistantResultSchema.parse({
      ...result,
      routing: { ...result.routing, externalDispatchPerformed: true },
    })).toThrow();
  });
});
