import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const defaultRepositoryRoot = path.resolve(scriptDirectory, "..");
export const manifestRelativePath = "release/endvera-construction-v1/release-manifest.json";
const gitObjectPattern = /^[a-f0-9]{40}$/u;
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/u,
  /\bghp_[A-Za-z0-9]{20,}\b/u,
];

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

export function sha256(bufferOrString) {
  return createHash("sha256").update(bufferOrString).digest("hex");
}

export function assertRepositoryPath(repositoryRoot, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) throw new Error("RELEASE_PATH_ESCAPE_REFUSED");
  const normalized = relativePath.replace(/\\/gu, "/");
  if (normalized.split("/").includes("..") || normalized.startsWith("/")) throw new Error("RELEASE_PATH_ESCAPE_REFUSED");
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, normalized);
  const prefix = `${root}${path.sep}`.toLowerCase();
  if (!resolved.toLowerCase().startsWith(prefix)) throw new Error("RELEASE_PATH_ESCAPE_REFUSED");
  return { normalized, resolved };
}

function parseJson(repositoryRoot, relativePath, readFile = readFileSync) {
  const { resolved } = assertRepositoryPath(repositoryRoot, relativePath);
  try {
    return JSON.parse(readFile(resolved, "utf8"));
  } catch (error) {
    if (!existsSync(resolved)) throw new Error("RELEASE_INPUT_MISSING");
    throw error;
  }
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.subarray(1, 4).toString("ascii") !== "PNG") throw new Error("RELEASE_ASSET_FORMAT_INVALID");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function assertNoSecretMaterial(buffer) {
  const text = buffer.toString("utf8");
  if (secretPatterns.some((pattern) => pattern.test(text))) throw new Error("RELEASE_SECRET_VALUE_REFUSED");
}

export function validateEnvironmentPresence(contract, mode, presence) {
  if (mode !== "LOCAL_INTERNAL" && mode !== "EXTERNAL_RELEASE") throw new Error("RELEASE_MODE_UNKNOWN");
  if (!presence || typeof presence !== "object" || Array.isArray(presence)) throw new Error("RELEASE_ENVIRONMENT_INVALID");
  const known = new Set(contract.variables.map((item) => item.name));
  for (const [name, present] of Object.entries(presence)) {
    if (!known.has(name)) throw new Error("RELEASE_ENVIRONMENT_UNKNOWN");
    if (typeof present !== "boolean") throw new Error("RELEASE_SECRET_VALUE_REFUSED");
  }
  if (mode === "EXTERNAL_RELEASE") throw new Error("RELEASE_EXTERNAL_AUTHORITY_REQUIRED");
  for (const variable of contract.variables) {
    const requirement = variable.local;
    if (requirement.startsWith("REQUIRED_") && presence[variable.name] !== true) throw new Error("RELEASE_ENVIRONMENT_MISSING");
    if (requirement === "PROHIBITED" && presence[variable.name] === true) throw new Error("RELEASE_LOCAL_PROVIDER_REFUSED");
  }
  return { mode, valid: true, names: Object.keys(presence).sort() };
}

function validateDefinition(definition, appConfig, environmentContract, listings, disclosure, submissionGaps) {
  const boundary = definition.boundary;
  if (definition.readinessCeiling !== "LOCAL_PACKAGE_READY" || boundary.signed || boundary.uploaded || boundary.published || boundary.deployed || boundary.providerObserved || boundary.externalEffectCount !== 0) throw new Error("RELEASE_ACTION_INFLATION_REFUSED");
  if (JSON.stringify(definition.targets) !== JSON.stringify(["WEB", "IOS", "ANDROID"])) throw new Error("RELEASE_TARGETS_MISMATCH");
  const expo = appConfig.expo;
  const ios = definition.identities.find((item) => item.target === "IOS");
  const android = definition.identities.find((item) => item.target === "ANDROID");
  if (!expo || expo.name !== "ENDVERA" || expo.slug !== "endvera-mobile" || expo.version !== ios.semanticVersion || expo.scheme !== ios.scheme || expo.icon !== "./assets/images/icon.png" || expo.ios?.icon !== expo.icon || expo.ios?.bundleIdentifier !== ios.bundleIdentifier || expo.ios?.buildNumber !== ios.buildNumber || expo.android?.package !== android.package || expo.android?.versionCode !== android.versionCode) throw new Error("RELEASE_IDENTITY_MISMATCH");
  if (environmentContract.secretValuesSerializable !== false || environmentContract.localProviderValuesAllowed !== false || environmentContract.externalReleaseAuthorized !== false || "values" in environmentContract) throw new Error("RELEASE_ENVIRONMENT_BOUNDARY_INVALID");
  const [french, english] = listings;
  if (french.locale !== "fr-CA" || english.locale !== "en-CA" || JSON.stringify(french.capabilityCodes) !== JSON.stringify(english.capabilityCodes) || JSON.stringify(french.unavailableCapabilityCodes) !== JSON.stringify(english.unavailableCapabilityCodes)) throw new Error("RELEASE_LOCALE_PARITY_MISMATCH");
  for (const listing of listings) {
    if (listing.stage !== "LOCAL_BUILD" || listing.priceState !== "PRICE_NOT_SET" || listing.providerObserved || listing.customerProofAvailable || listing.productMarketFitProven || listing.storeAvailable) throw new Error("RELEASE_CLAIM_UNSUPPORTED");
  }
  if (disclosure.tracking || disclosure.advertising || disclosure.dataSale || disclosure.broadContactBookCollection || disclosure.broadMailboxCollection || disclosure.backgroundRecording || !Array.isArray(disclosure.classes) || disclosure.classes.length !== 9 || new Set(disclosure.classes.map((item) => item.code)).size !== disclosure.classes.length) throw new Error("RELEASE_DISCLOSURE_INCOMPLETE");
  if (submissionGaps.storeSubmissionReady !== false || submissionGaps.productionDeploymentReady !== false || !submissionGaps.unresolved?.some((item) => item.code === "FINAL_BRAND_ASSETS") || !submissionGaps.unresolved?.some((item) => item.code === "SIGNING_CUSTODY")) throw new Error("RELEASE_SUBMISSION_GAPS_INCOMPLETE");
}

export function packageInputPaths(definition) {
  return [
    "release/endvera-construction-v1/release-definition.json",
    definition.environmentContractPath,
    ...definition.listingPaths,
    definition.disclosurePath,
    definition.submissionGapsPath,
    ...definition.runbookPaths,
    "apps/mobile/app.json",
    "apps/mobile/src/lib/release.ts",
    "apps/mobile/src/app/(app)/settings.tsx",
    "src/lib/construction-operating-assistant-r35/contracts.ts",
    "src/lib/construction-operating-assistant-r35/registry.ts",
    "src/app/construction/support/page.tsx",
    "scripts/generate-endvera-release-package.mjs",
    "scripts/validate-endvera-release-package.mjs",
    ...definition.assets.map((asset) => asset.path),
    ...definition.supportingAssetPaths,
  ].map((item) => item.replace(/\\/gu, "/")).sort();
}

export function buildReleaseManifest({ repositoryRoot = defaultRepositoryRoot, sourceHead, sourceTree, readFile = readFileSync }) {
  if (!gitObjectPattern.test(sourceHead) || !gitObjectPattern.test(sourceTree)) throw new Error("RELEASE_SOURCE_FINGERPRINT_INVALID");
  const definition = parseJson(repositoryRoot, "release/endvera-construction-v1/release-definition.json", readFile);
  const environmentContract = parseJson(repositoryRoot, definition.environmentContractPath, readFile);
  const listings = definition.listingPaths.map((item) => parseJson(repositoryRoot, item, readFile));
  const disclosure = parseJson(repositoryRoot, definition.disclosurePath, readFile);
  const submissionGaps = parseJson(repositoryRoot, definition.submissionGapsPath, readFile);
  const appConfig = parseJson(repositoryRoot, "apps/mobile/app.json", readFile);
  validateDefinition(definition, appConfig, environmentContract, listings, disclosure, submissionGaps);

  for (const asset of definition.assets) {
    const { resolved } = assertRepositoryPath(repositoryRoot, asset.path);
    const bytes = readFile(resolved);
    const dimensions = pngDimensions(bytes);
    if (dimensions.width !== asset.width || dimensions.height !== asset.height) throw new Error("RELEASE_ASSET_DIMENSION_MISMATCH");
  }

  const inputs = packageInputPaths(definition).map((relativePath) => {
    const { resolved } = assertRepositoryPath(repositoryRoot, relativePath);
    let bytes;
    try { bytes = readFile(resolved); } catch { throw new Error("RELEASE_INPUT_MISSING"); }
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    assertNoSecretMaterial(bytes);
    return { path: relativePath, byteSize: bytes.length, sha256: sha256(bytes) };
  });
  const base = {
    schemaVersion: 1,
    releaseKey: "ENDVERA_CONSTRUCTION_V1",
    releaseVersion: 1,
    readiness: "LOCAL_PACKAGE_READY",
    source: { head: sourceHead, tree: sourceTree },
    targets: ["WEB", "IOS", "ANDROID"],
    definitionHash: sha256(canonicalJson(definition)),
    environmentContractHash: sha256(canonicalJson(environmentContract)),
    inputs,
    validationCommands: [
      "node scripts/validate-endvera-release-package.mjs",
      "npm test -- --run test/construction-operating-assistant-r35-release-package.test.ts",
      "npm --prefix apps/mobile test -- --run test/release-package.test.ts",
    ],
    ...definition.boundary,
  };
  return { ...base, manifestHash: sha256(canonicalJson(base)) };
}

export function writeReleaseManifest(options) {
  const manifest = buildReleaseManifest(options);
  const { resolved } = assertRepositoryPath(options.repositoryRoot ?? defaultRepositoryRoot, manifestRelativePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const rendered = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(resolved, rendered, "utf8");
  return { manifest, rendered };
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value || (key !== "--head" && key !== "--tree" && key !== "--root")) throw new Error("RELEASE_ARGUMENT_INVALID");
    values[key.slice(2)] = value;
  }
  return values;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = parseArguments(process.argv.slice(2));
  const result = writeReleaseManifest({ repositoryRoot: args.root ? path.resolve(args.root) : defaultRepositoryRoot, sourceHead: args.head, sourceTree: args.tree });
  process.stdout.write(`LOCAL_PACKAGE_READY ${result.manifest.manifestHash}\n`);
}
