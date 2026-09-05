import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  R37BB_MODELS,
  buildCorrectedOpenRouterRequest,
  correctedOpenRouterRequestSchema,
  evaluateZdrCompatibility,
  openRouterEndpointSnapshotSchema,
} from "@/lib/construction-operating-assistant-r37bb/contracts";
import { R37_CASES } from "@/lib/construction-operating-assistant-r37/cases";

const snapshotPath = "specs/193-openrouter-zdr-compatibility-correction/evidence/openrouter-endpoint-eligibility-2026-09-05.json";
const reportPath = "specs/192-openrouter-provider-sandbox/evidence/observed-provider-report.json";

describe("R37B OpenRouter ZDR compatibility correction", () => {
  it("proves both exact models exist and retain compatible ZDR endpoints", () => {
    const snapshot = openRouterEndpointSnapshotSchema.parse(JSON.parse(readFileSync(snapshotPath, "utf8")));
    const decision = evaluateZdrCompatibility(snapshot, new Date("2026-09-05T12:00:00.000Z"));

    expect(decision.map((item) => item.modelId)).toEqual(R37BB_MODELS);
    expect(decision.every((item) => item.modelExists)).toBe(true);
    expect(decision.map((item) => item.eligibleEndpointTags.length)).toEqual([3, 2]);
    expect(decision.every((item) => item.incompatibleR37Parameters.join(",") === "max_tokens,temperature")).toBe(true);
    expect(decision.every((item) => item.correctedParameter === "max_completion_tokens")).toBe(true);
  });

  it("builds the corrected exact request and rejects the incompatible field", () => {
    const request = buildCorrectedOpenRouterRequest(R37BB_MODELS[0], R37_CASES[0]);
    expect(request).toMatchObject({
      model: "openai/gpt-5.4",
      max_completion_tokens: 512,
      provider: {
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: true,
      },
    });
    expect(request).not.toHaveProperty("max_tokens");
    expect(request).not.toHaveProperty("temperature");
    expect(correctedOpenRouterRequestSchema.safeParse({ ...request, max_tokens: 512 }).success).toBe(false);
    expect(correctedOpenRouterRequestSchema.safeParse({ ...request, temperature: 0 }).success).toBe(false);
  });

  it("fails closed when metadata or privacy requirements drift", () => {
    const raw = JSON.parse(readFileSync(snapshotPath, "utf8"));
    expect(openRouterEndpointSnapshotSchema.safeParse({ ...raw, capturedAtUtc: "not-a-date" }).success).toBe(false);
    expect(() => evaluateZdrCompatibility(raw, new Date("2026-09-13T00:00:00.001Z")))
      .toThrow("R37BB_METADATA_STALE");
    expect(() => evaluateZdrCompatibility({
      ...raw,
      models: raw.models.map((model: { modelId: string; zdrEndpoints: unknown[] }) =>
        model.modelId === R37BB_MODELS[0] ? { ...model, zdrEndpoints: [] } : model),
    }, new Date("2026-09-05T12:00:00.000Z"))).toThrow("R37BB_NO_COMPATIBLE_ZDR_ENDPOINT");
    const request = buildCorrectedOpenRouterRequest(R37BB_MODELS[0], R37_CASES[0]);
    for (const provider of [
      { ...request.provider, zdr: false },
      { ...request.provider, allow_fallbacks: true },
      { ...request.provider, require_parameters: false },
      { ...request.provider, data_collection: "allow" },
    ]) {
      expect(() => buildCorrectedOpenRouterRequest(R37BB_MODELS[0], R37_CASES[0], provider)).toThrow();
    }
  });

  it("preserves the sealed R37 REWORK report byte-exactly", () => {
    const bytes = readFileSync(reportPath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3",
    );
    expect(JSON.parse(bytes.toString("utf8"))).toMatchObject({
      verdict: "REWORK",
      dispatchedCallCount: 1,
      canonicalObservationCount: 0,
      settledSpendMicros: "0",
    });
  });
});
