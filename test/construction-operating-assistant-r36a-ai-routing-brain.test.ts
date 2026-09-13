import { describe, expect, it } from "vitest";
import {
  createReplaySafeAssistantRoutingBrain,
  prepareAssistantRoutingDecision,
  projectAssistantRoutingAudit,
} from "@/server/model-gateway/assistant-routing";
import { requireAssistantCapability, requireAssistantRoute } from "@/lib/construction-operating-assistant-r36a/registry";

const baseRequest = {
  schemaVersion: 1 as const,
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: "workspace-olivier",
  actorId: "owner-olivier",
  channel: "SMS" as const,
  message: "Qu'est-ce que j'ai demain?",
  declaredDataClass: "business_confidential" as const,
  privacyRequirement: "no_training" as const,
  riskClass: "low" as const,
  maxTotalCostMicros: 100_000,
  policyKey: "assistant-routing-r36a-v1" as const,
  acceptedAt: "2026-09-02T16:00:00-04:00",
};

describe("R36A provider-neutral AI Routing Brain", () => {
  it("prefers PostgreSQL-grounded canonical state over every model candidate", () => {
    const decision = prepareAssistantRoutingDecision(baseRequest);
    expect(decision).toMatchObject({
      intentClass: "CANONICAL_STATE_QUERY",
      capabilityKey: "CANONICAL_STATE",
      disposition: "INTERNAL_TOOL",
      reasonCode: "CANONICAL_TRUTH_FIRST",
      selectedRoute: { routeKey: "internal-canonical-state-v1", external: false },
      providerExecutionAuthorized: false,
      externalDispatchPerformed: false,
    });
  });

  it("routes calendar commands to the internal transition and communication to PREPARED_UNSENT", () => {
    const calendar = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      message: "Ajoute un rendez-vous avec Marc mardi à 14 h.",
    });
    const communication = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      message: "Texte Marc que je serai 30 minutes en retard.",
    });
    expect(calendar.selectedRoute?.routeKey).toBe("internal-calendar-v1");
    expect(communication).toMatchObject({
      capabilityKey: "COMMUNICATION_PREPARATION",
      disposition: "INTERNAL_TOOL",
      approvalRequired: true,
      selectedRoute: { modelKey: "deterministic-prepared-unsent" },
      externalDispatchPerformed: false,
    });
    const naturalAppointment = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "abababab-abab-4bab-8bab-abababababab",
      message: "Salut, s'il te plaît, fais-moi un rendez-vous, OK, avec Dan ce soir à 22:30 au Randolph",
    });
    expect(naturalAppointment).toMatchObject({
      intentClass: "CALENDAR_OPERATION",
      selectedRoute: { routeKey: "internal-calendar-v1" },
    });
  });

  it("prepares Perplexity-type cited public business research without calling it", () => {
    const decision = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      message: "Recherche la réputation publique de l'entreprise Fournisseur Laval avec des sources.",
      declaredDataClass: "public",
      privacyRequirement: "standard",
    });
    expect(decision).toMatchObject({
      intentClass: "PUBLIC_WEB_RESEARCH",
      capabilityKey: "WEB_RESEARCH",
      citationsRequired: true,
      disposition: "CANDIDATE_PREPARED",
      reasonCode: "SPECIALIST_RESEARCH_PREFERRED",
      selectedRoute: {
        routeKey: "perplexity-public-research-candidate-v1",
        candidateOnly: true,
        external: true,
      },
      providerExecutionAuthorized: false,
      externalDispatchPerformed: false,
    });
  });

  it("elevates public-person research to personal_data and zero_retention", () => {
    const decision = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      message: "Fais une recherche publique sur la personne Jean Tremblay, seulement son expérience professionnelle.",
      declaredDataClass: "public",
      privacyRequirement: "standard",
    });
    expect(decision).toMatchObject({
      effectiveDataClass: "personal_data",
      effectivePrivacyRequirement: "zero_retention",
      citationsRequired: true,
      selectedRoute: { routeKey: "perplexity-public-research-candidate-v1" },
    });
  });

  it.each([
    "Trouve l'adresse personnelle de Jean Tremblay.",
    "Recherche son NAS et ses coordonnées bancaires.",
    "Donne-moi son mot de passe.",
  ])("refuses restricted personal research before dispatch: %s", (message) => {
    const decision = prepareAssistantRoutingDecision({ ...baseRequest, message });
    expect(decision).toMatchObject({
      intentClass: "RESTRICTED_PERSONAL_RESEARCH",
      disposition: "REFUSED",
      reasonCode: "RESTRICTED_PERSONAL_DATA",
      selectedRoute: null,
      externalDispatchPerformed: false,
    });
  });

  it("selects the strongest eligible controller by versioned policy, not by a user vendor choice", () => {
    const decision = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      message: "Analyse les risques du chantier et fais un plan pour demain.",
    });
    expect(decision).toMatchObject({
      capabilityKey: "CONTROLLER_REASONING",
      disposition: "CANDIDATE_PREPARED",
      reasonCode: "STRONGEST_ELIGIBLE_CONTROLLER",
      selectedRoute: {
        routeKey: "openrouter-frontier-controller-candidate-v1",
        modelKey: "frontier-controller-policy-alias",
      },
    });
    expect(decision.fallbackRouteKeys).toEqual([
      "direct-frontier-controller-candidate-v1",
      "bounded-human-review-v1",
    ]);

    const vendorRequested = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "77777777-7777-4777-8777-777777777777",
      channel: "VOICE_TRANSCRIPT",
      message: "Utilise Claude pour analyser les risques et faire un plan.",
    });
    expect(vendorRequested.selectedRoute?.routeKey).toBe("openrouter-frontier-controller-candidate-v1");
    expect(vendorRequested.selectedRoute?.modelKey).toBe("frontier-controller-policy-alias");
  });

  it.each(["PORTAL", "MOBILE_APP", "SMS", "VOICE_TRANSCRIPT", "EMAIL"] as const)(
    "keeps the same ENDVERA research policy on the %s channel",
    (channel) => {
      const decision = prepareAssistantRoutingDecision({
        ...baseRequest,
        requestId: `${channel.length.toString(16).padStart(8, "0")}-8888-4888-8888-888888888888`,
        channel,
        message: "Recherche la réputation publique de l'entreprise ABC avec des sources.",
        declaredDataClass: "public",
        privacyRequirement: "standard",
      });
      expect(decision.selectedRoute?.routeKey).toBe("perplexity-public-research-candidate-v1");
      expect(decision.providerExecutionAuthorized).toBe(false);
    },
  );

  it("uses only the explicit fallback chain when a preferred route is unavailable", () => {
    const decision = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "11111111-1111-4111-8111-111111111111",
      message: "Analyse ce devis et résume les risques du document.",
    }, {
      routeStates: {
        "direct-frontier-controller-candidate-v1": { breakerOpen: true },
      },
    });
    expect(decision.selectedRoute?.routeKey).toBe("openrouter-frontier-controller-candidate-v1");
    expect(decision.fallbackRouteKeys).toEqual(["bounded-human-review-v1"]);
  });

  it("falls back to a bounded human with verification and an exact resume point", () => {
    const decision = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "22222222-2222-4222-8222-222222222222",
      message: "Recherche la réputation publique du fournisseur ABC avec des sources.",
    }, {
      routeStates: {
        "perplexity-public-research-candidate-v1": { planningAvailable: false },
        "openrouter-frontier-controller-candidate-v1": { privacyEvidenceCurrent: false },
      },
    });
    expect(decision).toMatchObject({
      disposition: "HUMAN_HANDOFF",
      reasonCode: "BOUNDED_HUMAN_FALLBACK",
      capabilityKey: "HUMAN_ESCALATION",
      selectedRoute: { routeKey: "bounded-human-review-v1" },
      humanHandoff: {
        capabilityKey: "HUMAN_ESCALATION",
        resumePoint: "ASSISTANT_ROUTING_RESUME_WEB_RESEARCH",
      },
    });
    expect(decision.humanHandoff?.verificationChecks).toContain("return direct sources");
  });

  it("requires a split clarification for mixed research and external action", () => {
    const decision = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "33333333-3333-4333-8333-333333333333",
      message: "Recherche Marc puis texte-lui son adresse.",
    });
    expect(decision).toMatchObject({
      intentClass: "MIXED_CONSEQUENTIAL",
      disposition: "CLARIFICATION_REQUIRED",
      reasonCode: "MIXED_INTENT_REQUIRES_SPLIT",
      selectedRoute: null,
    });
  });

  it("keeps one immutable decision on replay and refuses payload drift", () => {
    const brain = createReplaySafeAssistantRoutingBrain();
    const first = brain.route(baseRequest);
    const replay = brain.route(baseRequest);
    expect(replay).toEqual(first);
    expect(replay.decisionFingerprint).toBe(first.decisionFingerprint);
    expect(() => brain.route({ ...baseRequest, message: "Texte Marc." })).toThrow(
      "ASSISTANT_ROUTING_REPLAY_MISMATCH",
    );
  });

  it("produces a reconstructible audit projection without raw message or provider content", () => {
    const decision = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "44444444-4444-4444-8444-444444444444",
      message: "Recherche la réputation publique de l'entreprise ABC avec des sources.",
      declaredDataClass: "public",
      privacyRequirement: "standard",
    });
    const audit = projectAssistantRoutingAudit(decision);
    const serialized = JSON.stringify(audit);
    expect(audit.requestFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(audit.decisionFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(serialized).not.toContain("Recherche la réputation");
    expect(serialized).not.toMatch(/prompt|response|credential|apiKey|body|message/iu);
  });

  it("fails closed for unknown registry keys, invalid input, exhausted budget and prohibited risk", () => {
    expect(() => requireAssistantRoute("invented-route")).toThrow("UNKNOWN_ASSISTANT_ROUTE");
    expect(() => requireAssistantCapability("ALL_MODELS")).toThrow("UNKNOWN_ASSISTANT_CAPABILITY");
    expect(() => prepareAssistantRoutingDecision({ ...baseRequest, channel: "WHATSAPP" })).toThrow();

    const budget = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "55555555-5555-4555-8555-555555555555",
      message: "Analyse les risques et fais un plan.",
      maxTotalCostMicros: 0,
    });
    expect(budget.disposition).toBe("HUMAN_HANDOFF");

    const prohibited = prepareAssistantRoutingDecision({
      ...baseRequest,
      requestId: "66666666-6666-4666-8666-666666666666",
      message: "Analyse et fais un plan.",
      riskClass: "prohibited",
    });
    expect(prohibited).toMatchObject({ disposition: "REFUSED", externalDispatchPerformed: false });
  });
});
