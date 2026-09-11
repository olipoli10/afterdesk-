import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { releaseManifestSchema, storeListingSchema } from "@/lib/construction-operating-assistant-r35/contracts";
import {
  RELEASE_BOUNDARY,
  RELEASE_LISTINGS,
  RELEASE_PUBLIC_PATHS,
  assertReleaseRegistryHonest,
  releaseDefinition,
  releaseEnvironmentContract,
} from "@/lib/construction-operating-assistant-r35/registry";
import {
  assertRepositoryPath,
  buildReleaseManifest,
  canonicalJson,
  defaultRepositoryRoot,
  validateEnvironmentPresence,
} from "../scripts/generate-endvera-release-package.mjs";
import { validateReleaseManifest } from "../scripts/validate-endvera-release-package.mjs";

const source = { sourceHead: "a".repeat(40), sourceTree: "b".repeat(40) };
const localPresence = {
  DATABASE_URL: true,
  DIRECT_URL: true,
  BETTER_AUTH_SECRET: true,
  BETTER_AUTH_URL: true,
  EXPO_PUBLIC_ENDVERA_API_URL: true,
};

describe("R35 deterministic local release packaging", () => {
  it("keeps one closed local-only registry and exact cross-platform identity", () => {
    expect(() => assertReleaseRegistryHonest()).not.toThrow();
    expect(releaseDefinition).toMatchObject({ releaseKey: "ENDVERA_CONSTRUCTION_V1", targets: ["WEB", "IOS", "ANDROID"], readinessCeiling: "LOCAL_PACKAGE_READY" });
    expect(RELEASE_BOUNDARY).toEqual({ signed: false, uploaded: false, published: false, deployed: false, providerObserved: false, externalEffectCount: 0 });
    const app = JSON.parse(readFileSync("apps/mobile/app.json", "utf8")).expo;
    expect(app).toMatchObject({ name: "ENDVERA", slug: "endvera", version: "0.2.0", scheme: "endvera", ios: { bundleIdentifier: "ai.endvera.mobile", buildNumber: "1" }, android: { package: "ai.endvera.mobile", versionCode: 6 } });
  });

  it("validates local environment presence without accepting or returning values", () => {
    expect(validateEnvironmentPresence(releaseEnvironmentContract, "LOCAL_INTERNAL", localPresence)).toEqual({ mode: "LOCAL_INTERNAL", valid: true, names: Object.keys(localPresence).sort() });
    expect(() => validateEnvironmentPresence(releaseEnvironmentContract, "LOCAL_INTERNAL", { ...localPresence, BETTER_AUTH_SECRET: "secret" })).toThrow("RELEASE_SECRET_VALUE_REFUSED");
    expect(() => validateEnvironmentPresence(releaseEnvironmentContract, "LOCAL_INTERNAL", { ...localPresence, ANTHROPIC_API_KEY: true })).toThrow("RELEASE_LOCAL_PROVIDER_REFUSED");
    expect(() => validateEnvironmentPresence(releaseEnvironmentContract, "LOCAL_INTERNAL", { ...localPresence, UNKNOWN: true })).toThrow("RELEASE_ENVIRONMENT_UNKNOWN");
    expect(() => validateEnvironmentPresence(releaseEnvironmentContract, "EXTERNAL_RELEASE", localPresence)).toThrow("RELEASE_EXTERNAL_AUTHORITY_REQUIRED");
  });

  it("builds the same strict manifest twice with exact assets and no release effect", () => {
    const first = releaseManifestSchema.parse(buildReleaseManifest({ repositoryRoot: defaultRepositoryRoot, ...source }));
    const second = releaseManifestSchema.parse(buildReleaseManifest({ repositoryRoot: defaultRepositoryRoot, ...source }));
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(releaseManifestSchema.parse(first)).toEqual(first);
    expect(first.inputs.map((item) => item.path)).toEqual([...first.inputs.map((item) => item.path)].sort());
    expect(first).toMatchObject({ readiness: "LOCAL_PACKAGE_READY", signed: false, uploaded: false, published: false, deployed: false, providerObserved: false, externalEffectCount: 0 });
    expect(validateReleaseManifest({ repositoryRoot: defaultRepositoryRoot, manifest: first })).toEqual(first);
  });

  it("refuses path escape, invalid source and a one-byte input mutation", () => {
    expect(() => assertRepositoryPath(defaultRepositoryRoot, "../secret.txt")).toThrow("RELEASE_PATH_ESCAPE_REFUSED");
    expect(() => assertRepositoryPath(defaultRepositoryRoot, "C:\\secret.txt")).toThrow("RELEASE_PATH_ESCAPE_REFUSED");
    expect(() => buildReleaseManifest({ repositoryRoot: defaultRepositoryRoot, sourceHead: "bad", sourceTree: source.sourceTree })).toThrow("RELEASE_SOURCE_FINGERPRINT_INVALID");
    const manifest = buildReleaseManifest({ repositoryRoot: defaultRepositoryRoot, ...source });
    const mutatedPath = path.resolve(defaultRepositoryRoot, "apps/mobile/assets/images/icon.png");
    const readFile = ((filePath: Parameters<typeof readFileSync>[0], encoding?: BufferEncoding) => {
      const resolvedPath = String(filePath);
      const value = readFileSync(filePath, encoding as BufferEncoding | undefined);
      if (path.resolve(resolvedPath) !== mutatedPath || typeof value === "string") return value;
      const mutated = Buffer.from(value); mutated[mutated.length - 1] ^= 1; return mutated;
    }) as typeof readFileSync;
    expect(() => validateReleaseManifest({ repositoryRoot: defaultRepositoryRoot, manifest, readFile })).toThrow("RELEASE_INPUT_HASH_MISMATCH");
  });

  it("refuses secret-shaped package material and inflated boundary claims", () => {
    const target = path.resolve(defaultRepositoryRoot, "docs/release/endvera-construction-v1/01-environment-and-build.md");
    const readFile = ((filePath: Parameters<typeof readFileSync>[0], encoding?: BufferEncoding) => path.resolve(String(filePath)) === target ? Buffer.from("-----BEGIN PRIVATE KEY-----") : readFileSync(filePath, encoding as BufferEncoding | undefined)) as typeof readFileSync;
    expect(() => buildReleaseManifest({ repositoryRoot: defaultRepositoryRoot, ...source, readFile })).toThrow("RELEASE_SECRET_VALUE_REFUSED");
    const manifest = buildReleaseManifest({ repositoryRoot: defaultRepositoryRoot, ...source });
    expect(() => releaseManifestSchema.parse({ ...manifest, published: true })).toThrow();
  });

  it("keeps bilingual listing codes and unsupported claims exactly aligned", () => {
    const french = storeListingSchema.parse(RELEASE_LISTINGS["fr-CA"]);
    const english = storeListingSchema.parse(RELEASE_LISTINGS["en-CA"]);
    expect(french.capabilityCodes).toEqual(english.capabilityCodes);
    expect(french.unavailableCapabilityCodes).toEqual(english.unavailableCapabilityCodes);
    for (const listing of [french, english]) expect(listing).toMatchObject({ stage: "LOCAL_BUILD", priceState: "PRICE_NOT_SET", providerObserved: false, customerProofAvailable: false, productMarketFitProven: false, storeAvailable: false });
  });

  it("keeps store submission blocked on real brand, screenshots, signing and review", () => {
    const gaps = JSON.parse(readFileSync("release/endvera-construction-v1/submission-gaps.json", "utf8"));
    expect(gaps).toMatchObject({ storeSubmissionReady: false, productionDeploymentReady: false });
    expect(gaps.unresolved.map((item: { code: string }) => item.code)).toEqual(expect.arrayContaining(["FINAL_BRAND_ASSETS", "IOS_SCREENSHOTS", "ANDROID_SCREENSHOTS", "SIGNING_CUSTODY", "PRIVACY_LEGAL_REVIEW"]));
  });

  it("publishes safe routes and honest local support copy", () => {
    expect(RELEASE_PUBLIC_PATHS).toEqual({ privacy: "/privacy", security: "/security", support: "/construction/support", accountDeletion: "/account-deletion" });
    const support = readFileSync("src/app/construction/support/page.tsx", "utf8");
    expect(support).toContain("Le produit est encore local.");
    expect(support).toContain("No external customer-support channel");
    expect(support).toContain("RELEASE_BOUNDARY");
  });

  it("uses local scripts with no network, signing, publish or deployment command", () => {
    const sources = ["scripts/generate-endvera-release-package.mjs", "scripts/validate-endvera-release-package.mjs"].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(sources).not.toMatch(/fetch\(|https?:\/\/|eas\s+(?:build|submit)|vercel\s+(?:deploy|--prod)|app-store|play-console/iu);
    expect(sources).not.toMatch(/child_process|execSync|spawnSync/iu);
  });
});
