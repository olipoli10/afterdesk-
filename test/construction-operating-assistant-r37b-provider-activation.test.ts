import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  prepareProviderActivationGrantSchema,
  reserveProviderSpendSchema,
  setProviderLaneControlSchema,
} from "@/lib/construction-operating-assistant-r37b/contracts";

const fingerprint = `sha256:${"a".repeat(64)}`;

describe("R37B provider activation contracts", () => {
  it("requires exact bounded grant authority and rejects unknown fields", () => {
    const valid = {
      commandId: crypto.randomUUID(),
      actorId: "actor",
      workspaceId: "workspace",
      candidateKey: "OPENROUTER_CONTROLLER",
      exactModelId: "openai/gpt-5",
      sealedExecutorFingerprint: fingerprint,
      allowedCaseFingerprints: [fingerprint],
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      maxCallCount: 2,
      maxTotalSpendMicros: 5_000n,
    } as const;
    expect(prepareProviderActivationGrantSchema.parse(valid)).toMatchObject(valid);
    expect(() => prepareProviderActivationGrantSchema.parse({ ...valid, maxCallCount: 0 })).toThrow();
    expect(() => prepareProviderActivationGrantSchema.parse({ ...valid, maxTotalSpendMicros: 0n })).toThrow();
    expect(() => prepareProviderActivationGrantSchema.parse({ ...valid, exactModelId: "" })).toThrow();
    expect(() => prepareProviderActivationGrantSchema.parse({ ...valid, credential: "secret" })).toThrow();
  });

  it("requires a positive integer reservation and exact binding", () => {
    const valid = {
      actorId: "actor",
      workspaceId: "workspace",
      grantId: "grant",
      idempotencyKey: "attempt-1",
      caseFingerprint: fingerprint,
      exactModelId: "sonar-pro",
      sealedExecutorFingerprint: fingerprint,
      requestedMicros: 1n,
    } as const;
    expect(reserveProviderSpendSchema.parse(valid)).toMatchObject(valid);
    expect(() => reserveProviderSpendSchema.parse({ ...valid, requestedMicros: 0n })).toThrow();
    expect(() => reserveProviderSpendSchema.parse({ ...valid, exactModelId: "" })).toThrow();
  });

  it("makes lane state explicit and version checked", () => {
    expect(setProviderLaneControlSchema.parse({
      commandId: crypto.randomUUID(), actorId: "admin", state: "DISABLED",
      reason: "Emergency stop", expectedVersion: 0,
    })).toMatchObject({ state: "DISABLED", expectedVersion: 0 });
  });

  it("contains no provider, credential or network execution path", () => {
    const source = readFileSync(
      new URL("../src/server/construction-operating-assistant-r37b/activation.ts", import.meta.url),
      "utf8",
    );
    for (const forbidden of ["fetch(", "axios", "credentialRef", "process.env", "Authorization:", "apiKey"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("externalTransportPerformed: false");
  });
});
