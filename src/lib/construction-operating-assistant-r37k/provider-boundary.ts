export type ProviderBoundaryViolation = Readonly<{
  code: string;
  path: string;
}>;

const providerExecutionModuleFamily = [
  "construction-operating-assistant-r",
  "37",
].join("");
const PUBLIC_PROVIDER_EXECUTION_IMPORT = new RegExp(
  `(?:from\\s+|import\\s+(?!\\()|import\\s*\\(\\s*|require\\s*\\(\\s*)["'][^"']*${providerExecutionModuleFamily}(?:(?:a|b|c|f)/|/)`,
  "u",
);
const PUBLIC_PROVIDER_EXECUTION_SYMBOL =
  /\b(?:dispatchOpenRouterRequest|runR37OpenRouterCampaign|executeControlledSyntheticProviderDelivery|executeControlledSyntheticAttempt|runSyntheticAttempt|activateProviderActivationGrant|setProviderLaneControl|requestObservedProviderExecution)\b/u;

const fetchIdentifier = ["fet", "ch"].join("");
const axiosIdentifier = ["axi", "os"].join("");
const undiciIdentifier = ["undi", "ci"].join("");

const NETWORK_TRANSPORT_PATTERNS = [
  new RegExp(`\\b${fetchIdentifier}\\s*\\(`, "u"),
  new RegExp(`\\b${fetchIdentifier}\\b`, "u"),
  new RegExp(`\\b(?:${axiosIdentifier}|${undiciIdentifier})\\b`, "u"),
  /\bhttps?\.(?:request|get)\s*\(/u,
  /from\s+["']node:https?["']/u,
] as const;

const SECRET_ACCESS_PATTERNS = [
  /\bprocess\.env\b/u,
  /\bAuthorization\s*:/u,
  /\bBearer\s+/u,
  /\b(?:OPENROUTER|PERPLEXITY)_API_KEY\b/u,
  /\bapiKey\b/u,
] as const;

const DISPATCHABLE_PATTERNS = [
  /\bdispatchable\s*:\s*true\b/u,
  /\bcredentialResolved\s*:\s*true\b/u,
] as const;

function violation(code: string, path: string): ProviderBoundaryViolation {
  return { code, path };
}

function matchesAny(source: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(source));
}

export function inspectPublicEntrySource(
  path: string,
  source: string,
): ProviderBoundaryViolation[] {
  return PUBLIC_PROVIDER_EXECUTION_IMPORT.test(source) || PUBLIC_PROVIDER_EXECUTION_SYMBOL.test(source)
    ? [violation("R37K_PROVIDER_EXECUTION_IMPORT_EXPOSED", path)]
    : [];
}

export function inspectProviderRuntimeSource(
  path: string,
  source: string,
): ProviderBoundaryViolation[] {
  const violations: ProviderBoundaryViolation[] = [];
  if (matchesAny(source, NETWORK_TRANSPORT_PATTERNS)) {
    violations.push(violation("R37K_NETWORK_TRANSPORT_PRESENT", path));
  }
  if (matchesAny(source, SECRET_ACCESS_PATTERNS)) {
    violations.push(violation("R37K_SECRET_ACCESS_PRESENT", path));
  }
  if (matchesAny(source, DISPATCHABLE_PATTERNS)) {
    violations.push(violation("R37K_DISPATCHABLE_REQUEST_PRESENT", path));
  }
  return violations;
}

export function inspectAuthorizedObservedTransportSource(
  path: string,
  source: string,
): ProviderBoundaryViolation[] {
  const exactPath = "src/lib/construction-operating-assistant-r37/transport.ts";
  if (path.replaceAll("\\", "/") !== exactPath) {
    return inspectProviderRuntimeSource(path, source);
  }
  const violations: ProviderBoundaryViolation[] = [];
  if (!source.includes("process.env[R37_CREDENTIAL_ENV]")) {
    violations.push(violation("R37K_EXACT_SECRET_REFERENCE_REQUIRED", path));
  }
  if (!source.includes("(OPENROUTER_ENDPOINT,")) {
    violations.push(violation("R37K_EXACT_OPENROUTER_ENDPOINT_REQUIRED", path));
  }
  if (!source.includes("Authorization: `Bearer ${credential}`")) {
    violations.push(violation("R37K_EPHEMERAL_AUTHORIZATION_HEADER_REQUIRED", path));
  }
  if (matchesAny(source, DISPATCHABLE_PATTERNS)) {
    violations.push(violation("R37K_DISPATCHABLE_REQUEST_PRESENT", path));
  }
  if (/https?:\/\/(?!openrouter\.ai(?:\/|["']))/u.test(source)) {
    violations.push(violation("R37K_ALTERNATE_NETWORK_DESTINATION", path));
  }
  return violations;
}
