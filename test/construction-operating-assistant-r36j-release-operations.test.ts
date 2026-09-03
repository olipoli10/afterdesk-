import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import contract from "../release/endvera-construction-v1/release-operations-readiness.json";
import { validateReleaseOperationsReadiness } from "../src/lib/construction-operating-assistant-r36g-r36k/release-operations";

describe("R36J release observability and support", () => {
  it("defines a closed redacted signal vocabulary", () => {
    const report = validateReleaseOperationsReadiness(contract);
    expect(report.status).toBe("READY_FOR_MONITORING_PROVIDER_SELECTION");
    expect(report.signalCount).toBe(8);
    expect(contract.signals.map((item) => item.code)).toEqual([
      "WEB_LIVENESS",
      "AUTH_OUTCOME",
      "API_LATENCY_BUCKET",
      "BACKGROUND_JOB_STATE",
      "OUTBOX_STATE",
      "MOBILE_SYNC_STATE",
      "DATABASE_OPERATION_STATE",
      "SUPPORT_HANDOFF_STATE",
    ]);
    expect(contract.signals.every((item) => item.contentPolicy === "METADATA_ONLY_REDACTED")).toBe(true);
  });

  it("keeps all external monitoring and support adapters disabled and value-free", () => {
    expect(contract.adapters.every((item) => item.status === "DISABLED_CONFIG_ONLY" && item.endpoint === null && item.credentialReference === null)).toBe(true);
    expect(contract.externalEffectCount).toBe(0);
    expect(JSON.stringify(contract)).not.toMatch(/https?:\/\/|dsn|api[_-]?key|token|password|secret/iu);
  });

  it("defines severity, ownership and rollback decisions", () => {
    expect(contract.incidentLevels.map((item) => item.level)).toEqual(["SEV0", "SEV1", "SEV2", "SEV3"]);
    expect(contract.incidentLevels.every((item) => item.ownerClass && item.responseTargetMinutes > 0)).toBe(true);
    expect(contract.rollbackTriggers).toContain("EXTERNAL_EFFECT_WITHOUT_AUTHORITY");
    expect(contract.rollbackTriggers).toContain("CROSS_WORKSPACE_DISCLOSURE");
    expect(contract.rollbackTriggers).toContain("CANONICAL_STATE_CORRUPTION");
  });

  it("limits support handoff to opaque, bounded context", () => {
    expect(contract.supportHandoff).toMatchObject({ publicPath: "/construction/support", automaticExternalSend: false, rawMessageBodyAllowed: false, rawEvidenceAllowed: false });
    expect(contract.supportHandoff.allowedFields).toEqual(["incidentId", "workspaceOpaqueRef", "actorOpaqueRef", "releaseVersion", "signalCode", "severity", "occurredAtBucket", "reproductionCode"]);
  });

  it("fails closed on unknown signals, enabled adapters and hidden support content", () => {
    expect(() => validateReleaseOperationsReadiness({ ...contract, adapters: contract.adapters.map((item, index) => index === 0 ? { ...item, status: "ENABLED" } : item) })).toThrow("RELEASE_OPERATIONS_ADAPTER_ENABLED_REFUSED");
    expect(() => validateReleaseOperationsReadiness({ ...contract, signals: [...contract.signals, { code: "MESSAGE_BODY", contentPolicy: "RAW" }] })).toThrow("RELEASE_OPERATIONS_SIGNAL_DRIFT");
    expect(() => validateReleaseOperationsReadiness({ ...contract, supportHandoff: { ...contract.supportHandoff, rawMessageBodyAllowed: true } })).toThrow("RELEASE_OPERATIONS_SUPPORT_DISCLOSURE_REFUSED");
    expect(() => validateReleaseOperationsReadiness({ ...contract, deployed: true })).toThrow("RELEASE_OPERATIONS_CLAIM_INFLATION_REFUSED");
  });

  it("contains no network client or dynamic execution path", () => {
    const source = readFileSync("src/lib/construction-operating-assistant-r36g-r36k/release-operations.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|axios|child_process|execSync|spawnSync|eval\(/iu);
  });
});
