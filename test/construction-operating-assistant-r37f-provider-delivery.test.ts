import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  controlledProviderDeliveryResultSchema,
  providerFixtureAdapterResultSchema,
} from "@/lib/construction-operating-assistant-r37f/contracts";

describe("R37F provider delivery orchestration contracts", () => {
  it("refuses unknown adapter and result fields", () => {
    expect(providerFixtureAdapterResultSchema.safeParse({
      fixture: {},
      latencyMs: 1,
      costMicros: 1,
      externalTransportPerformed: false,
      credential: "forbidden",
    }).success).toBe(false);
    expect(controlledProviderDeliveryResultSchema.safeParse({
      controlledRun: {},
      canonicalEvidence: null,
      fixtureAdapterInvoked: false,
      externalTransportPerformed: false,
      providerObserved: true,
    }).success).toBe(false);
  });

  it("contains no network, credential resolution or external claim", () => {
    const source = [
      "src/lib/construction-operating-assistant-r37f/contracts.ts",
      "src/server/construction-operating-assistant-r37f/provider-delivery.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\bfetch\s*\(|axios|process\.env|Bun\.env|Deno\.env|\bAuthorization\s*:/u);
    expect(source).not.toMatch(/sk-[A-Za-z0-9]|pplx-[A-Za-z0-9]/u);
    expect(source).toContain("externalTransportPerformed: false");
  });
});
