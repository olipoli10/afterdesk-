import { describe, expect, it } from "vitest";
import sequence from "../specs/078-construction-assistant-v1-r2-founder-observed-loop/fixtures/equal-input-sequence.json";
import {
  assertEqualControlInputs,
  sha256Canonical,
} from "../specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/observation-contract";
import {
  buildStatelessControlResult,
  statelessControlInput,
} from "../specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/stateless-control";

describe("equal stateless control", () => {
  it("receives the same facts, ordering, language and reference time", () => {
    expect(() => assertEqualControlInputs(sequence, statelessControlInput)).not.toThrow();
    expect(buildStatelessControlResult().inputSha256).toBe(sha256Canonical(sequence));
  });

  it("stateless-control-claims-persistent-memory", () => {
    expect(buildStatelessControlResult()).toMatchObject({
      persistentMemory: false,
      databaseBacked: false,
      auditTrail: false,
      idempotencyProtection: false,
      exactApprovalMechanism: false,
    });
  });
});
