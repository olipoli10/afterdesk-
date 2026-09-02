import { z } from "zod";

export const RELEASE_SCHEMA_VERSION = 1 as const;
export const releaseTargetSchema = z.enum(["WEB", "IOS", "ANDROID"]);
export const releaseModeSchema = z.enum(["LOCAL_INTERNAL", "EXTERNAL_RELEASE"]);
export const releaseReadinessSchema = z.enum([
  "PACKAGE_INVALID",
  "LOCAL_PACKAGE_READY",
  "EXTERNAL_AUTHORITY_REQUIRED",
]);
export const releaseBoundarySchema = z.object({
  signed: z.literal(false),
  uploaded: z.literal(false),
  published: z.literal(false),
  deployed: z.literal(false),
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
}).strict();

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const gitObject = z.string().regex(/^[a-f0-9]{40}$/u);
const repositoryPath = z.string().min(1).max(300).refine(
  (value) => !value.startsWith("/") && !value.startsWith("\\") && !/^[a-z]:/iu.test(value) && !value.split(/[\\/]/u).includes(".."),
  "Repository-relative path required.",
);

export const releaseInputSchema = z.object({
  path: repositoryPath,
  byteSize: z.number().int().nonnegative(),
  sha256: hash,
}).strict();

export const releaseManifestSchema = z.object({
  schemaVersion: z.literal(RELEASE_SCHEMA_VERSION),
  releaseKey: z.literal("ENDVERA_CONSTRUCTION_V1"),
  releaseVersion: z.literal(1),
  readiness: z.literal("LOCAL_PACKAGE_READY"),
  source: z.object({ head: gitObject, tree: gitObject }).strict(),
  targets: z.tuple([z.literal("WEB"), z.literal("IOS"), z.literal("ANDROID")]),
  definitionHash: hash,
  environmentContractHash: hash,
  inputs: z.array(releaseInputSchema).min(1),
  validationCommands: z.tuple([
    z.literal("node scripts/validate-endvera-release-package.mjs"),
    z.literal("npm test -- --run test/construction-operating-assistant-r35-release-package.test.ts"),
    z.literal("npm --prefix apps/mobile test -- --run test/release-package.test.ts"),
  ]),
  signed: z.literal(false),
  uploaded: z.literal(false),
  published: z.literal(false),
  deployed: z.literal(false),
  providerObserved: z.literal(false),
  externalEffectCount: z.literal(0),
  manifestHash: hash,
}).strict();

export const storeListingSchema = z.object({
  schemaVersion: z.literal(1),
  locale: z.enum(["fr-CA", "en-CA"]),
  name: z.literal("ENDVERA"),
  subtitle: z.string().min(1).max(80),
  shortDescription: z.string().min(1).max(180),
  fullDescription: z.string().min(1).max(1000),
  capabilityCodes: z.tuple([
    z.literal("PERSISTENT_PROJECT_MEMORY"),
    z.literal("SCHEDULE_AND_FOLLOW_UP"),
    z.literal("EVIDENCE_AND_INVOICE_READINESS"),
    z.literal("PREPARED_COMMUNICATIONS"),
    z.literal("HUMAN_EXCEPTION_ROUTING"),
    z.literal("ROLE_SAFE_COCKPIT"),
  ]),
  unavailableCapabilityCodes: z.tuple([
    z.literal("LIVE_BILLING"),
    z.literal("LIVE_SMS"),
    z.literal("LIVE_CALLS"),
    z.literal("LIVE_CALENDAR"),
    z.literal("LIVE_ACCOUNTING"),
  ]),
  privacyPath: z.literal("/privacy"),
  supportPath: z.literal("/construction/support"),
  securityPath: z.literal("/security"),
  stage: z.literal("LOCAL_BUILD"),
  priceState: z.literal("PRICE_NOT_SET"),
  providerObserved: z.literal(false),
  customerProofAvailable: z.literal(false),
  productMarketFitProven: z.literal(false),
  storeAvailable: z.literal(false),
}).strict();

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export type StoreListing = z.infer<typeof storeListingSchema>;
