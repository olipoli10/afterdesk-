import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  assertInternalE2ECheckpointOrder,
  assertInternalE2EReportSanitized,
  INTERNAL_E2E_CHECKPOINT_CODES,
  parseInternalE2EReport,
  type InternalE2ECheckpointCode,
} from "@/lib/construction-operating-assistant-r36/contracts";
import { INTERNAL_E2E_SCENARIO_HASH } from "@/lib/construction-operating-assistant-r36/scenario";
import { runInternalE2EScenario } from "@/server/construction-operating-assistant-r36/internal-e2e";

describe("R36 internal E2E fail-closed contract", () => {
  it("refuses a missing, duplicated or reordered checkpoint", () => {
    const valid = INTERNAL_E2E_CHECKPOINT_CODES.map((code, index) => ({ sequence: index + 1, code }));
    expect(() => assertInternalE2ECheckpointOrder(valid.slice(1))).toThrow("INTERNAL_E2E_CHECKPOINT_COUNT_INVALID");
    expect(() => assertInternalE2ECheckpointOrder([valid[0], valid[0], ...valid.slice(2)])).toThrow("INTERNAL_E2E_CHECKPOINT_ORDER_INVALID");
    expect(() => assertInternalE2ECheckpointOrder([valid[1], valid[0], ...valid.slice(2)])).toThrow("INTERNAL_E2E_CHECKPOINT_ORDER_INVALID");
  });

  it("refuses secret, contact and raw-message fields anywhere in the report", () => {
    for (const leaked of [
      { password: "synthetic" },
      { nested: { normalizedPhone: "+15555550184" } },
      { nested: { body: "Texte Marc" } },
      { safe: "owner@example.invalid" },
    ]) expect(() => assertInternalE2EReportSanitized(leaked)).toThrow(/INTERNAL_E2E_REPORT/u);
  });

  it("runs every checkpoint once, seals the report and rejects restart drift", async () => {
    const calls: InternalE2ECheckpointCode[] = [];
    const steps = Object.fromEntries(INTERNAL_E2E_CHECKPOINT_CODES.map((code) => [code, vi.fn(async () => {
      calls.push(code);
      return { observed: true, canonicalState: { code }, externalEffectCount: 0 as const };
    })])) as unknown as Record<InternalE2ECheckpointCode, () => Promise<{ observed: true; canonicalState: { code: InternalE2ECheckpointCode }; externalEffectCount: 0 }>>;
    const restartHash = sha256Canonical({ stable: true });
    const report = await runInternalE2EScenario({
      source: { head: "1".repeat(40), tree: "2".repeat(40) },
      steps,
      restartFingerprints: () => ({ before: restartHash, after: restartHash }),
    });
    expect(calls).toEqual(INTERNAL_E2E_CHECKPOINT_CODES);
    expect(report).toMatchObject({ scenarioHash: INTERNAL_E2E_SCENARIO_HASH, verdict: "INTERNAL_SYNTHETIC_E2E_PASS", externalEffectCount: 0 });
    expect(parseInternalE2EReport(report)).toEqual(report);
    await expect(runInternalE2EScenario({
      source: { head: "1".repeat(40), tree: "2".repeat(40) }, steps,
      restartFingerprints: () => ({ before: restartHash, after: sha256Canonical({ stable: false }) }),
    })).rejects.toThrow("INTERNAL_E2E_RESTART_FINGERPRINT_DRIFT");
  });

  it("keeps the committed R36 report internally valid and hash-bound", () => {
    const report = JSON.parse(readFileSync(join(process.cwd(), "specs", "116-internal-e2e", "evidence", "internal-e2e-report.json"), "utf8"));
    expect(parseInternalE2EReport(report)).toEqual(report);
  });
});
