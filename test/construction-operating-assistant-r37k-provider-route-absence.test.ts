import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  inspectProviderRuntimeSource,
  inspectPublicEntrySource,
} from "@/lib/construction-operating-assistant-r37k/provider-boundary";
import { requestObservedProviderExecution } from "@/server/construction-operating-assistant-r37a/sealed-executor";

const repositoryRoot = process.cwd();

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [absolute] : [];
  });
}

function repositoryPath(absolute: string) {
  return relative(repositoryRoot, absolute).replaceAll("\\", "/");
}

describe("R37K provider route absence guard", () => {
  it("rejects a representative public route importing provider execution", () => {
    const violations = inspectPublicEntrySource(
      "src/app/api/provider/route.ts",
      'import { executeControlledSyntheticProviderDelivery } from "@/server/construction-operating-assistant-r37f/provider-delivery";',
    );
    expect(violations.map((item) => item.code)).toContain("R37K_PROVIDER_EXECUTION_IMPORT_EXPOSED");
  });

  it("rejects representative provider network, secret and dispatch mutations", () => {
    const source = [
      "const key = process.env.OPENROUTER_API_KEY;",
      'await fetch("https://example.invalid", { headers: { Authorization: `Bearer ${key}` } });',
      "const request = { dispatchable: true, credentialResolved: true };",
    ].join("\n");
    const codes = inspectProviderRuntimeSource(
      "src/server/construction-operating-assistant-r37x/unsafe.ts",
      source,
    ).map((item) => item.code);
    expect(codes).toContain("R37K_NETWORK_TRANSPORT_PRESENT");
    expect(codes).toContain("R37K_SECRET_ACCESS_PRESENT");
    expect(codes).toContain("R37K_DISPATCHABLE_REQUEST_PRESENT");
  });

  it("keeps all actual routes, actions, jobs and workers detached from R37 execution", () => {
    const publicRoots = [
      "src/app",
      "src/server/actions",
      "src/jobs",
      "src/workers",
    ].map((path) => join(repositoryRoot, path));
    const violations = publicRoots.flatMap(sourceFiles).flatMap((absolute) =>
      inspectPublicEntrySource(repositoryPath(absolute), readFileSync(absolute, "utf8"))
    );
    expect(violations).toEqual([]);
  });

  it("keeps every R37 runtime source free of transport, secret and dispatch mutations", () => {
    const runtimeRoots = ["src/lib", "src/server"].map((path) => join(repositoryRoot, path));
    const r37Files = runtimeRoots.flatMap(sourceFiles).filter((absolute) =>
      /construction-operating-assistant-r37[a-j]/u.test(repositoryPath(absolute))
    );
    expect(r37Files.length).toBeGreaterThan(0);
    const violations = r37Files.flatMap((absolute) =>
      inspectProviderRuntimeSource(repositoryPath(absolute), readFileSync(absolute, "utf8"))
    );
    expect(violations).toEqual([]);
  });

  it("keeps observed provider execution explicitly fail-closed", () => {
    expect(() => requestObservedProviderExecution()).toThrow(
      "R37A_OBSERVED_PROVIDER_AUTHORITY_REQUIRED",
    );
  });
});
