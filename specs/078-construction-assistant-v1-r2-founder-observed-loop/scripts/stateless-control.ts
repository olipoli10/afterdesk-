import input from "../fixtures/equal-input-sequence.json";
import { equalInputSequenceSchema, sha256Canonical } from "./observation-contract";

export const statelessControlInput = equalInputSequenceSchema.parse(structuredClone(input));

export function buildStatelessControlResult() {
  return {
    schemaVersion: 1 as const,
    controlId: "STATELESS_CHAT_STYLE_CONTROL" as const,
    inputSha256: sha256Canonical(statelessControlInput),
    persistentMemory: false as const,
    databaseBacked: false as const,
    auditTrail: false as const,
    idempotencyProtection: false as const,
    exactApprovalMechanism: false as const,
  };
}
