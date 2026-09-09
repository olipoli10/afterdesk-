import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCurrentProjection, requireExactInputs } from "../release/current-projection-v3.mjs";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  { target: "WEB", localStatus: "READY_FOR_DEPLOYMENT_AUTHORITY", firstExternalBlocker: "PUBLIC_PRODUCTION_ORIGIN", ownerClass: "FOUNDER_OR_RELEASE_OWNER" },
  { target: "IOS", localStatus: "READY_FOR_SIGNING_AUTHORITY", firstExternalBlocker: "APPLE_DEVELOPER_MEMBERSHIP", ownerClass: "FOUNDER_OR_RELEASE_OWNER" },
  { target: "ANDROID", localStatus: "READY_FOR_SIGNING_AUTHORITY", firstExternalBlocker: "GOOGLE_PLAY_DEVELOPER_ACCOUNT", ownerClass: "FOUNDER_OR_RELEASE_OWNER" },
];

const EVIDENCE = [
  { label: "CODE", available: true },
  { label: "TEST", available: true },
  { label: "SYNTHETIC", available: true },
  { label: "OBSERVED", available: false },
  { label: "INFERRED", available: false },
  { label: "UNKNOWN", available: true },
];

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(repositoryRoot, relativePath), "utf8"));
}

// Archived v1 field locations are fixed. Accepting arbitrary extra properties
// would let current/observed claims hitchhike on a historical-only result.
const REPORT_FIELDS = Object.freeze([
  "schemaVersion", "program", "status", "externalDecision", "targets", "sourceHashes",
  "evidence", "unknowns", "externalBlockers", "boundary", "storeReady",
  "nextAuthorizedLocalWork", "nextExternalRelease",
]);
const BOUNDARY_FIELDS = Object.freeze([
  "signed", "uploaded", "submitted", "deployed", "published", "providerObserved",
  "customerObserved", "productionReady", "externalEffectCount",
]);
function hasExactFields(value, fields) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every(key => Object.hasOwn(value, key));
}

export function validateMarketReadiness(report, root = repositoryRoot) {
  if (!hasExactFields(report, REPORT_FIELDS) || report.program !== "R36G_R36K_MARKET_READINESS"
    || !hasExactFields(report.boundary, BOUNDARY_FIELDS)) throw new Error("MARKET_READINESS_CLAIM_INFLATION_REFUSED");
  if (!report || report.schemaVersion !== 1 || report.status !== "LOCAL_MARKET_PREPARATION_COMPLETE" || report.externalDecision !== "EXTERNAL_AUTHORITY_REQUIRED" || report.storeReady !== false || report.deployed === true || report.published === true || report.productionReady === true) throw new Error("MARKET_READINESS_CLAIM_INFLATION_REFUSED");
  const boundary = report.boundary;
  if (!boundary || boundary.signed !== false || boundary.uploaded !== false || boundary.submitted !== false || boundary.deployed !== false || boundary.published !== false || boundary.providerObserved !== false || boundary.customerObserved !== false || boundary.productionReady !== false || boundary.externalEffectCount !== 0) throw new Error("MARKET_READINESS_CLAIM_INFLATION_REFUSED");
  if (!same(report.targets, TARGETS)) throw new Error("MARKET_READINESS_TARGET_DRIFT");
  if (!same(report.evidence, EVIDENCE)) throw new Error("MARKET_READINESS_EVIDENCE_INFLATION_REFUSED");

  const hashes = Array.isArray(report.sourceHashes) ? report.sourceHashes : [];
  requireExactInputs(hashes, [
    "release/endvera-construction-v1/release-definition.json",
    "release/endvera-construction-v1/mobile-build-readiness.json",
    "release/endvera-construction-v1/web-production-readiness.json",
    "release/endvera-construction-v1/store-compliance-readiness.json",
    "release/endvera-construction-v1/release-operations-readiness.json",
  ], "MARKET_READINESS_SOURCE_SET_MISMATCH");
  if (hashes.length !== 5 || new Set(hashes.map((item) => item.path)).size !== 5) throw new Error("MARKET_READINESS_SOURCE_SET_MISMATCH");
  for (const item of hashes) {
    if (path.isAbsolute(item.path) || item.path.split(/[\\/]/u).includes("..")) throw new Error("MARKET_READINESS_SOURCE_PATH_REFUSED");
    const actual = createHash("sha256").update(readFileSync(path.resolve(root, item.path))).digest("hex");
    if (actual !== item.sha256) throw new Error("MARKET_READINESS_SOURCE_HASH_MISMATCH");
  }

  const byPath = new Map(hashes.map((item) => [item.path, item]));
  const mobile = JSON.parse(readFileSync(path.resolve(root, "release/endvera-construction-v1/mobile-build-readiness.json"), "utf8"));
  const web = JSON.parse(readFileSync(path.resolve(root, "release/endvera-construction-v1/web-production-readiness.json"), "utf8"));
  const store = JSON.parse(readFileSync(path.resolve(root, "release/endvera-construction-v1/store-compliance-readiness.json"), "utf8"));
  const operations = JSON.parse(readFileSync(path.resolve(root, "release/endvera-construction-v1/release-operations-readiness.json"), "utf8"));
  if (!byPath.has("release/endvera-construction-v1/release-definition.json") || mobile.status !== "READY_FOR_SIGNING_AUTHORITY" || web.readiness !== "READY_FOR_DEPLOYMENT_AUTHORITY" || store.readiness !== "READY_FOR_EXTERNAL_COMPLIANCE_INPUTS" || operations.readiness !== "READY_FOR_MONITORING_PROVIDER_SELECTION") throw new Error("MARKET_READINESS_CONSTITUENT_NOT_READY");

  const blockers = Array.isArray(report.externalBlockers) ? report.externalBlockers : [];
  if (blockers.length < 12 || new Set(blockers.map((item) => item.code)).size !== blockers.length || blockers.some((item) => !item.ownerClass || !item.evidenceRequired || !Array.isArray(item.targets) || item.targets.length === 0)) throw new Error("MARKET_READINESS_BLOCKERS_INCOMPLETE");
  if (report.nextAuthorizedLocalWork !== null || report.nextExternalRelease !== "R37-EXTERNAL-PROVIDER-SANDBOX") throw new Error("MARKET_READINESS_NEXT_ACTION_DRIFT");
  return { status: "HISTORICAL_STATIC_ATTESTATION_ONLY", historicalStatus: report.status,
    currentReadiness: "NOT_EVALUATED", externalDecision: "NOT_EVALUATED", sourceHashesVerified: hashes.length, blockerCount: blockers.length };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = process.argv.includes("--historical")
    ? validateMarketReadiness(readJson("release/endvera-construction-v1/market-readiness-report.json"))
    : readCurrentProjection(repositoryRoot);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
