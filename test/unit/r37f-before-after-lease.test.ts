import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Exact committed pre-patch source versus current source. Only dependency seams
// are synthetic: no database, provider, secrets or network. The fixture callback
// throws a local marker so no evidence-normalization stub can hide its invocation.
const sourcePath = "src/server/construction-operating-assistant-r37f/provider-delivery.ts";
// Pin the recorded pre-patch campaign revision: HEAD changes during the parent
// campaign and must never silently turn the before-control into patched source.
const baselineRevision = "a9c4c01fdb2fcdff3838a6966f1560832bc32553";
const historicalSource = execFileSync("git", ["show", `${baselineRevision}:${sourcePath}`], { encoding: "utf8", windowsHide: true });
const currentSource = readFileSync(sourcePath, "utf8");

async function exercise(source: string) {
  const start = Date.parse("2026-09-02T12:00:00.000Z");
  let now = start;
  let calls = 0;
  const parse = { parse: (value: unknown) => value };
  const dependencies: Record<string, unknown> = {
    "@/lib/construction-operating-assistant-r37c/contracts": { executeControlledSyntheticAttemptSchema: parse },
    "@/lib/construction-operating-assistant-r37d/contracts": { canonicalProviderEvidenceSchema: parse },
    "@/lib/construction-operating-assistant-r37a/contracts": { r37aFingerprint: () => "unused" },
    "@/lib/construction-operating-assistant-r37d/normalize": { normalizeSyntheticProviderFixture: () => { throw new Error("NORMALIZATION_MUST_NOT_BE_REACHED"); } },
    "@/lib/construction-operating-assistant-r37f/contracts": { controlledProviderDeliveryResultSchema: parse, providerFixtureAdapterResultSchema: parse },
    "@/lib/db": { prisma: { controlledProviderRun: { findFirst: async () => { now = start + 2; return { id: "run", leaseExpiresAt: new Date(start + 1), canonicalEvidenceSnapshot: null, canonicalEvidenceFingerprint: null }; } } } },
    "@/server/construction-operating-assistant-r37b/activation": { readProviderTrustedNow: () => new Date(now) },
    "@/server/construction-operating-assistant-r37c/coordinator": {
      executeControlledSyntheticAttempt: (_input: unknown, adapter: (request: object, context: object) => Promise<unknown>) => adapter({}, { runId: "run", leaseToken: "fixture-lease" }),
      assertCurrentControlledRunAuthority: () => { throw new Error("EXPIRED_LEASE_MUST_FAIL_BEFORE_SECOND_LOOKUP"); },
    },
  };
  const moduleExports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, { exports: moduleExports, require: (name: string) => { if (!(name in dependencies)) throw new Error("UNEXPECTED_DEPENDENCY"); return dependencies[name]; } }, { timeout: 1000 });
  let failure = "";
  try {
    await moduleExports.executeControlledSyntheticProviderDelivery({ grantId: "grant", idempotencyKey: "attempt", workspaceId: "synthetic" }, async () => { calls++; throw new Error("LOCAL_FIXTURE_INVOKED"); });
  } catch (error) { failure = (error as Error).message; }
  return { calls, failure };
}

describe("R37F exact source before/after delayed lease read", () => {
  it("historical implementation invokes fixture after lease expiry", async () => {
    expect(await exercise(historicalSource)).toEqual({ calls: 1, failure: "LOCAL_FIXTURE_INVOKED" });
  });
  it("current implementation refuses before fixture invocation", async () => {
    expect(await exercise(currentSource)).toEqual({ calls: 0, failure: "R37F_ACTIVE_LEASE_REQUIRED" });
  });
});
