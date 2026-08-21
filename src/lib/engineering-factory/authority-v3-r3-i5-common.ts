import { createHash } from "node:crypto";

export type AuthorityV3R3I5Role =
  | "windows-outer-deny-controller"
  | "wsl-enforcement-controller"
  | "observer-service"
  | "observer-signer"
  | "evidence-broker"
  | "evidence-resolver"
  | "external-cleanup-verifier"
  | "barrier-authority"
  | "runtime-supervisor"
  | "semantic-validator";

export type AuthorityV3R3I5Binding<Role extends AuthorityV3R3I5Role = AuthorityV3R3I5Role> = {
  role: Role;
  identityId: string;
  operatingSystemIdentity: string;
  binarySha256: string;
  configurationSha256: string;
  keyId: string;
  publicKeySpkiSha256: string;
};

export class AuthorityV3R3I5Refusal extends Error {
  constructor(errorId: string) {
    super(errorId);
    this.name = "AuthorityV3R3I5Refusal";
  }
}

export function refuseAuthorityV3R3I5(errorId: string): never {
  throw new AuthorityV3R3I5Refusal(errorId);
}

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function requireAuthorityV3R3I5Sha256(value: string, errorId: string): void {
  if (!SHA256.test(value)) refuseAuthorityV3R3I5(errorId);
}

export function requireAuthorityV3R3I5SafeId(value: string, errorId: string): void {
  if (!SAFE_ID.test(value)) refuseAuthorityV3R3I5(errorId);
}

export function validateAuthorityV3R3I5Binding<Role extends AuthorityV3R3I5Role>(
  binding: AuthorityV3R3I5Binding<Role>,
  expectedRole: Role,
  errorId = "E_GATE_ROLE_MAPPING_INVALID"
): void {
  if (binding.role !== expectedRole) refuseAuthorityV3R3I5(errorId);
  requireAuthorityV3R3I5SafeId(binding.identityId, errorId);
  requireAuthorityV3R3I5SafeId(binding.keyId, errorId);
  if (!binding.operatingSystemIdentity) refuseAuthorityV3R3I5(errorId);
  requireAuthorityV3R3I5Sha256(binding.binarySha256, errorId);
  requireAuthorityV3R3I5Sha256(binding.configurationSha256, errorId);
  requireAuthorityV3R3I5Sha256(binding.publicKeySpkiSha256, errorId);
}

export function validateAuthorityV3R3I5Independence(
  producer: AuthorityV3R3I5Binding,
  acceptor: AuthorityV3R3I5Binding
): void {
  const dimensions: Array<keyof AuthorityV3R3I5Binding> = [
    "role",
    "identityId",
    "operatingSystemIdentity",
    "binarySha256",
    "configurationSha256",
    "keyId",
    "publicKeySpkiSha256",
  ];
  if (dimensions.some((dimension) => producer[dimension] === acceptor[dimension])) {
    refuseAuthorityV3R3I5("E_GATE_ACCEPTOR_NOT_INDEPENDENT");
  }
}

export function authorityV3R3I5Sha256(value: unknown): string {
  const canonicalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonicalize);
    if (typeof item !== "object" || item === null) return item;
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

export function deepFreezeAuthorityV3R3I5<Value>(value: Value): Readonly<Value> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreezeAuthorityV3R3I5(nested);
    }
  }
  return value;
}

export const AUTHORITY_V3_R3_I5_SOURCE_CEILING = Object.freeze({
  schemaVersion: "3.3.0" as const,
  sourceOnly: true as const,
  executionAuthorized: false as const,
  syntheticFixtureExecutionAuthorized: false as const,
  realCandidateExecutionAuthorized: false as const,
  providerExecutionAuthorized: false as const,
  providerCalls: 0 as const,
  realCandidateInvocations: 0 as const,
});
