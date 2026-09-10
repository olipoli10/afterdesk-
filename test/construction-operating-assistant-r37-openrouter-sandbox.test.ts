import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  OPENROUTER_ENDPOINT,
  R37_AUTHORITY,
  R37_MODELS,
  assertExchangeCeiling,
  controllerOutputSchema,
  createOpenRouterRequest,
  openRouterRequestSchema,
  r37CampaignReportSchema,
  roundUsdCostToMicros,
} from "@/lib/construction-operating-assistant-r37/contracts";
import { R37_CASES } from "@/lib/construction-operating-assistant-r37/cases";
import { evaluateR37Case } from "@/lib/construction-operating-assistant-r37/oracle";
import { dispatchOpenRouterRequest } from "@/lib/construction-operating-assistant-r37/transport";
import { validateProviderBoundaryModules } from "@/lib/construction-operating-assistant-r37o/provider-boundary-release-gate";

const validOutput = {
  answer: "The file is not ready to invoice because written approval and work proof are missing.",
  citedFactIds: ["F-101", "F-102", "F-103"],
  proposedCapability: "CLARIFY" as const,
  limitations: ["No external action was performed."],
};

describe("R37 OpenRouter closed-world contracts", () => {
  it("reuses the schema rebuilt by the PostgreSQL integration setup", () => {
    const validator = readFileSync(
      "specs/192-openrouter-provider-sandbox/scripts/validate-r37-openrouter-sandbox.ps1",
      "utf8",
    );
    expect(validator).toContain(
      "npm run test:integration -- test/integration/construction-operating-assistant-r37-openrouter-sandbox.itest.ts",
    );
    expect(validator).not.toMatch(/&\s+npx\s+prisma\s+migrate\s+deploy/);
  });

  it("validates a sealed observed report without reopening provider execution", () => {
    const validator = readFileSync(
      "specs/192-openrouter-provider-sandbox/scripts/validate-r37-openrouter-sandbox.ps1",
      "utf8",
    );
    const reportOnlyGate = validator.indexOf("if ($ReportOnly)");
    const repositoryExecution = validator.indexOf("Push-Location $repoRoot");

    expect(reportOnlyGate).toBeGreaterThan(0);
    expect(repositoryExecution).toBeGreaterThan(reportOnlyGate);
    expect(validator).toContain('Write-Output "R37_NETWORK_CALLS=0"');
    expect(validator).toContain('if ($Report.verdict -eq "OPENROUTER_SANDBOX_OBSERVED_PASS")');
    expect(validator).toContain('elseif ($Report.verdict -eq "REWORK")');
  });

  it("freezes the stricter authority below the founder ceiling", () => {
    expect(R37_AUTHORITY).toMatchObject({
      gateway: "OPENROUTER",
      syntheticOnly: true,
      founderCeilingCadMicros: 10_000_000n,
      applicationCeilingUsdMicros: 5_000_000n,
      maxPaidCalls: 6,
    });
    expect(assertExchangeCeiling(new Date("2026-09-04T12:00:00.000Z"))).toBe(6_894_500n);
    expect(() => assertExchangeCeiling(new Date("2026-09-11T00:00:01.000Z"))).toThrow(
      "R37_EXCHANGE_EVIDENCE_EXPIRED",
    );
    expect(roundUsdCostToMicros(0.0000001)).toBe(1n);
    expect(roundUsdCostToMicros(0.1000001)).toBe(100_001n);
  });

  it("builds exactly two models by three byte-equal synthetic cases", () => {
    expect(R37_MODELS).toEqual(["openai/gpt-5.4", "openai/gpt-5.4-mini"]);
    expect(R37_CASES).toHaveLength(3);
    for (const observedCase of R37_CASES) {
      const strong = createOpenRouterRequest(R37_MODELS[0], observedCase);
      const efficient = createOpenRouterRequest(R37_MODELS[1], observedCase);
      expect({ ...strong, model: "MODEL" }).toEqual({ ...efficient, model: "MODEL" });
      expect(strong.provider).toEqual({
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: true,
      });
      expect(strong).not.toHaveProperty("tools");
      expect(strong).not.toHaveProperty("models");
    }
  });

  it("kills request and evidence mutations instead of weakening the campaign", () => {
    const request = createOpenRouterRequest(R37_MODELS[0], R37_CASES[0]);
    for (const mutation of [
      { ...request, model: "other/model" },
      { ...request, provider: { ...request.provider, allow_fallbacks: true } },
      { ...request, provider: { ...request.provider, require_parameters: false } },
      { ...request, provider: { ...request.provider, data_collection: "allow" } },
      { ...request, provider: { ...request.provider, zdr: false } },
      { ...request, tools: [{ type: "function" }] },
    ]) {
      expect(openRouterRequestSchema.safeParse(mutation).success).toBe(false);
    }
    expect(r37CampaignReportSchema.safeParse({
      schemaVersion: 1,
      campaignId: "fixture-fraud",
      provider: "OPENROUTER",
      evidenceLabel: "SYNTHETIC",
      expectedCallCount: 6,
      dispatchedCallCount: 6,
      canonicalObservationCount: 6,
      replayedDispatchCount: 0,
      settledSpendMicros: "0",
      founderCeilingCadMicros: "10000000",
      applicationCeilingUsdMicros: "5000000",
      observations: [],
      selectedR38Candidate: null,
      failureCodes: [],
      grantsRevoked: true,
      providerLaneDisabled: true,
      externalCommunicationPerformed: false,
      externalToolWritePerformed: false,
      deploymentPerformed: false,
      verdict: "OPENROUTER_SANDBOX_OBSERVED_PASS",
    }).success).toBe(false);
  });

  it("rejects unknown output fields and deterministic grounding failures", () => {
    expect(controllerOutputSchema.safeParse({ ...validOutput, surprise: true }).success).toBe(false);
    expect(evaluateR37Case(R37_CASES[0], validOutput)).toMatchObject({ passed: true, inventedFactCount: 0 });
    expect(evaluateR37Case(R37_CASES[0], { ...validOutput, citedFactIds: ["F-999"] })).toMatchObject({
      passed: false,
      reasonCodes: expect.arrayContaining(["R37_UNKNOWN_FACT_CITATION"]),
    });
    expect(evaluateR37Case(R37_CASES[0], { ...validOutput, answer: "I sent the invoice to the customer." })).toMatchObject({
      passed: false,
      reasonCodes: expect.arrayContaining(["R37_EXTERNAL_EFFECT_CLAIMED"]),
    });
  });
});

describe("R37 exact private OpenRouter transport", () => {
  it("allows the network and secret only in the exact private module", () => {
    const source = readFileSync("src/lib/construction-operating-assistant-r37/transport.ts", "utf8");
    expect(validateProviderBoundaryModules(new Map([
      ["src/lib/construction-operating-assistant-r37/transport.ts", source],
    ]))).toEqual([]);
    expect(validateProviderBoundaryModules(new Map([
      ["src/server/construction-operating-assistant-r37/transport.ts", source],
    ])).map((item) => item.code)).toEqual(expect.arrayContaining([
      "R37O_NETWORK_TRANSPORT_PRESENT",
      "R37O_SECRET_ACCESS_PRESENT",
    ]));
    expect(validateProviderBoundaryModules(new Map([
      ["src/app/api/provider/route.ts", 'import { dispatchOpenRouterRequest } from "@/lib/construction-operating-assistant-r37/transport";'],
      ["src/lib/construction-operating-assistant-r37/transport.ts", source],
    ])).map((item) => item.code)).toEqual(expect.arrayContaining([
      "R37O_DIRECT_PROVIDER_EXECUTION_EXPOSED",
      "R37O_TRANSITIVE_PROVIDER_EXECUTION_EXPOSED",
    ]));
    const alternate = source.replace(
      "const controller = new AbortController();",
      'const alternate = "https://example.invalid/provider";\n  void alternate;\n  const controller = new AbortController();',
    );
    expect(validateProviderBoundaryModules(new Map([
      ["src/lib/construction-operating-assistant-r37/transport.ts", alternate],
    ])).map((item) => item.code)).toContain("R37O_ALTERNATE_NETWORK_DESTINATION");
  });

  it("does not dispatch when the local credential is absent", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      dispatchOpenRouterRequest({
        modelId: R37_MODELS[0],
        observedCase: R37_CASES[0],
        fetchImpl,
        credentialResolver: () => undefined,
        now: () => new Date("2026-09-04T12:00:00.000Z"),
      }),
    ).rejects.toThrow("R37_CREDENTIAL_REQUIRED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("dispatches one exact privacy-bound request and returns no credential", async () => {
    const secret = "local-test-secret-never-persist";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "gen-r37-1",
          model: R37_MODELS[0],
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(validOutput) } }],
          usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140, cost: 0.0012341 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await dispatchOpenRouterRequest({
      modelId: R37_MODELS[0],
      observedCase: R37_CASES[0],
      fetchImpl,
      credentialResolver: () => secret,
      now: () => new Date("2026-09-04T12:00:00.000Z"),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(OPENROUTER_ENDPOINT);
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(JSON.parse(String(init?.body))).toEqual(createOpenRouterRequest(R37_MODELS[0], R37_CASES[0]));
    expect(result).toMatchObject({
      responseId: "gen-r37-1",
      modelId: R37_MODELS[0],
      costMicros: 1_235n,
      output: validOutput,
    });
    expect(JSON.stringify(result, (_key, value) => typeof value === "bigint" ? value.toString() : value)).not.toContain(secret);
  });

  it("fails closed on model drift, missing cost and provider errors without leaking credential", async () => {
    const secret = "private-secret-long-enough";
    const base = {
      id: "gen-r37-fail",
      model: R37_MODELS[0],
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(validOutput) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0.00001 },
    };
    for (const [body, expected] of [
      [{ ...base, model: "other/model" }, "R37_RESPONSE_MODEL_DRIFT"],
      [{ ...base, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }, "R37_RESPONSE_COST_REQUIRED"],
      [{ ...base, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(validOutput), tool_calls: [] } }] }, "R37_RESPONSE_TOOL_CALL_REFUSED"],
      [{ ...base, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0.100001 } }, "R37_ATTEMPT_COST_CEILING_EXCEEDED"],
    ] as const) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
      await expect(dispatchOpenRouterRequest({ modelId: R37_MODELS[0], observedCase: R37_CASES[0], fetchImpl, credentialResolver: () => secret, now: () => new Date("2026-09-04T12:00:00.000Z") })).rejects.toThrow(expected);
    }
    const providerFailure = vi.fn<typeof fetch>().mockResolvedValue(new Response(`failure ${secret}`, { status: 403 }));
    const error = await dispatchOpenRouterRequest({ modelId: R37_MODELS[0], observedCase: R37_CASES[0], fetchImpl: providerFailure, credentialResolver: () => secret, now: () => new Date("2026-09-04T12:00:00.000Z") }).catch((cause: unknown) => cause);
    expect(String(error)).toContain("R37_PROVIDER_HTTP_403");
    expect(String(error)).not.toContain(secret);
  });
  it("still refuses expired R37 authority before any transport", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(dispatchOpenRouterRequest({ modelId: R37_MODELS[0], observedCase: R37_CASES[0], fetchImpl, credentialResolver: () => "synthetic-secret", now: () => new Date("2026-09-11T00:00:01Z") })).rejects.toThrow("R37_EXCHANGE_EVIDENCE_EXPIRED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
