import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createTrustedAssistantRoutingRequest,
  projectClientAssistantRouting,
  replyForNonInternalRouting,
} from "@/server/construction-operating-assistant-r36c/orchestrator";
import { prepareAssistantRoutingDecision } from "@/server/model-gateway/assistant-routing";
import { unifiedAssistantResultSchema } from "@/lib/construction-operating-assistant-r36c/contracts";

const request = {
  schemaVersion: 1 as const,
  requestId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "workspace-1",
  message: "Recherche la réputation publique de l'entreprise ABC avec des sources.",
  occurredAt: "2026-09-02T16:00:00.000Z",
};

describe("R36C unified assistant routing contracts", () => {
  it("derives policy fields on the server and never accepts a client provider choice", () => {
    const trusted = createTrustedAssistantRoutingRequest({
      userId: "owner-1",
      channel: "MOBILE_APP",
      request,
    });
    expect(trusted).toMatchObject({
      actorId: "owner-1",
      channel: "MOBILE_APP",
      declaredDataClass: "business_confidential",
      privacyRequirement: "no_training",
      riskClass: "medium",
      policyKey: "assistant-routing-r36a-v1",
    });
    expect(trusted.maxTotalCostMicros).toBe(100_000);
    expect(trusted).not.toHaveProperty("provider");
    expect(trusted).not.toHaveProperty("model");
  });

  it.each(["PORTAL", "MOBILE_APP", "SMS", "VOICE_TRANSCRIPT", "EMAIL"] as const)(
    "projects the same provider-neutral policy on %s",
    (channel) => {
      const decision = prepareAssistantRoutingDecision(createTrustedAssistantRoutingRequest({
        userId: "owner-1",
        channel,
        request,
      }));
      const projection = projectClientAssistantRouting(decision);
      expect(projection).toMatchObject({
        intentClass: "PUBLIC_WEB_RESEARCH",
        capabilityKey: "WEB_RESEARCH",
        disposition: "CANDIDATE_PREPARED",
        readiness: "PROVIDER_REQUIRED_NOT_AUTHORIZED",
        citationsRequired: true,
        providerExecutionAuthorized: false,
        externalDispatchPerformed: false,
      });
      expect(JSON.stringify(projection)).not.toMatch(/perplexity|openrouter|claude|modelKey|routeKey|adapterKey|cost/iu);
    },
  );

  it("returns a truthful no-result reply for deferred intelligence", () => {
    const decision = prepareAssistantRoutingDecision(createTrustedAssistantRoutingRequest({
      userId: "owner-1",
      channel: "MOBILE_APP",
      request,
    }));
    const deferred = replyForNonInternalRouting(decision);
    expect(deferred).toMatchObject({ intent: "UNSUPPORTED", status: "REFUSED" });
    expect(deferred.reply).toContain("Aucune recherche n’a été exécutée");
    expect(deferred.reply).not.toMatch(/selon|résultat trouvé|source:|https?:\/\//iu);
  });

  it("uses clarification for mixed work and refusal for restricted personal research", () => {
    const mixed = prepareAssistantRoutingDecision(createTrustedAssistantRoutingRequest({
      userId: "owner-1",
      channel: "SMS",
      request: { ...request, message: "Recherche Marc puis texte-lui son adresse." },
    }));
    const restricted = prepareAssistantRoutingDecision(createTrustedAssistantRoutingRequest({
      userId: "owner-1",
      channel: "VOICE_TRANSCRIPT",
      request: { ...request, message: "Trouve l'adresse personnelle de Jean Tremblay." },
    }));
    expect(replyForNonInternalRouting(mixed)).toMatchObject({
      intent: "CLARIFICATION_REQUIRED",
      status: "CLARIFICATION_REQUIRED",
    });
    expect(replyForNonInternalRouting(restricted)).toMatchObject({
      intent: "UNSUPPORTED",
      status: "REFUSED",
    });
  });

  it("keeps routine communication internal and approval-gated", () => {
    const communication = prepareAssistantRoutingDecision(createTrustedAssistantRoutingRequest({
      userId: "owner-1",
      channel: "SMS",
      request: { ...request, message: "Texte Marc que je serai 30 minutes en retard." },
    }));
    expect(communication).toMatchObject({
      intentClass: "COMMUNICATION_DRAFT",
      disposition: "INTERNAL_TOOL",
      approvalRequired: true,
      providerExecutionAuthorized: false,
      externalDispatchPerformed: false,
    });
  });

  it("wires the production mobile route through R36C instead of calling R9 directly", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/endvera/v1/mobile/assistant/route.ts"),
      "utf8",
    );
    expect(route).toContain("processUnifiedAssistantRequest");
    expect(route).not.toContain("processConstructionMobileAssistantRequest");
  });

  it("requires the minimal routing projection and rejects provider leakage", () => {
    const base = {
      schemaVersion: 1,
      commandId: request.requestId,
      messageId: "m1",
      assistantMessageId: "m2",
      intent: "UNSUPPORTED",
      status: "REFUSED",
      reply: "Non exécuté.",
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
    expect(unifiedAssistantResultSchema.parse(base)).toEqual(base);
    expect(() => unifiedAssistantResultSchema.parse({
      ...base,
      routing: { ...base.routing, modelKey: "secret-model" },
    })).toThrow();
  });
});
