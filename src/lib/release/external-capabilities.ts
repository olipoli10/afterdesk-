export type ExternalCapability = "AI" | "EMAIL" | "GOOGLE_OAUTH";

export type ExternalCapabilityDecision = {
  capability: ExternalCapability;
  enabled: boolean;
  missingRequirements: string[];
};

type Environment = Readonly<Record<string, string | undefined>>;

const CAPABILITY_REQUIREMENTS: Record<ExternalCapability, { enableName: string; configurationNames: string[] }> = {
  AI: { enableName: "ENDVERA_AI_PROVIDER_ENABLED", configurationNames: ["ANTHROPIC_API_KEY", "AI_MODEL"] },
  EMAIL: { enableName: "ENDVERA_EMAIL_PROVIDER_ENABLED", configurationNames: ["RESEND_API_KEY", "EMAIL_FROM"] },
  GOOGLE_OAUTH: { enableName: "ENDVERA_GOOGLE_OAUTH_ENABLED", configurationNames: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] },
};

function hasValue(environment: Environment, name: string): boolean {
  return Boolean(environment[name]?.trim());
}

export function externalCapabilityDecision(
  capability: ExternalCapability,
  environment: Environment = process.env,
): ExternalCapabilityDecision {
  const requirements = CAPABILITY_REQUIREMENTS[capability];
  const missingRequirements: string[] = [];

  if (environment.ENDVERA_EXTERNAL_TRANSPORT_ENABLED !== "ENABLED") missingRequirements.push("GLOBAL_TRANSPORT_ENABLED");
  if (!hasValue(environment, "ENDVERA_EXTERNAL_AUTHORITY_REF")) missingRequirements.push("AUTHORITY_REFERENCE");
  if (!hasValue(environment, "ENDVERA_EXTERNAL_OWNER_REF")) missingRequirements.push("OWNER_REFERENCE");
  if (environment[requirements.enableName] !== "ENABLED") missingRequirements.push("CAPABILITY_ENABLED");
  for (const name of requirements.configurationNames) {
    if (!hasValue(environment, name)) missingRequirements.push(`CONFIGURATION:${name}`);
  }

  return { capability, enabled: missingRequirements.length === 0, missingRequirements };
}

export function isExternalCapabilityEnabled(
  capability: ExternalCapability,
  environment: Environment = process.env,
): boolean {
  return externalCapabilityDecision(capability, environment).enabled;
}

