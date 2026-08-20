import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  validateDevBenchCatalog,
  type DevBenchCatalog,
} from "@/lib/engineering-factory/devbench";
import { DEV_BENCH_V1 } from "@/lib/engineering-factory/catalog";

const ROOT = resolve(__dirname, "..");

describe("Engineering Factory DevBench v1", () => {
  it("has a representative, runnable local-only catalog", () => {
    const report = validateDevBenchCatalog(DEV_BENCH_V1, {
      pathExists: (relativePath) => existsSync(resolve(ROOT, relativePath)),
    });

    expect(report.ok, report.errors.join("\n")).toBe(true);
    expect(DEV_BENCH_V1.cases).toHaveLength(8);
    expect(new Set(DEV_BENCH_V1.cases.map((item) => item.family)).size).toBeGreaterThanOrEqual(6);
    expect(DEV_BENCH_V1.cases.every((item) => item.providerExposure === "none")).toBe(true);
    expect(DEV_BENCH_V1.cases.every((item) => item.requiredEvidence.length > 0)).toBe(true);
    expect(DEV_BENCH_V1.cases.every((item) => item.mutation)).toBe(true);
  });

  const validate = (catalog: DevBenchCatalog) =>
    validateDevBenchCatalog(catalog, {
      pathExists: (relativePath) => existsSync(resolve(ROOT, relativePath)),
    });

  it("mutation catalog-duplicate-id is caught", () => {
    const report = validate({
      version: 1,
      name: "duplicate fixture",
      cases: [...DEV_BENCH_V1.cases, { ...DEV_BENCH_V1.cases[0] }],
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("duplicate id: EF-001");
  });

  it("mutation catalog-destructive-command is caught", () => {
    const report = validate({
      version: 1,
      name: "destructive fixture",
      cases: [
        { ...DEV_BENCH_V1.cases[0], commands: ["prisma migrate reset --force"] },
        ...DEV_BENCH_V1.cases.slice(1),
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("EF-001: forbidden command: prisma migrate reset --force");
  });

  it("mutation catalog-missing-source-evidence is caught", () => {
    const report = validate({
      version: 1,
      name: "missing source fixture",
      cases: [
        { ...DEV_BENCH_V1.cases[0], sourcePaths: ["src/does-not-exist.ts"] },
        ...DEV_BENCH_V1.cases.slice(1),
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("EF-001: source path does not exist: src/does-not-exist.ts");
  });

  it("mutation catalog-provider-exposure is caught", () => {
    const exposed = {
      ...DEV_BENCH_V1.cases[0],
      providerExposure: "candidate" as "none",
    };
    const report = validate({
      version: 1,
      name: "provider exposure fixture",
      cases: [exposed, ...DEV_BENCH_V1.cases.slice(1)],
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("EF-001: provider exposure must be none");
  });

  it("keeps benchmark references inside the checkout and never treats an absent path as evidence", () => {
    for (const benchCase of DEV_BENCH_V1.cases) {
      for (const relativePath of benchCase.sourcePaths) {
        expect(relativePath.startsWith("/")).toBe(false);
        expect(relativePath.includes("..\\")).toBe(false);
        expect(relativePath.includes("../")).toBe(false);
        expect(existsSync(resolve(ROOT, relativePath))).toBe(true);
      }
    }
  });
});
