import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  privacyDataClassSchema,
  type PrivacyDataClass,
  type PrivacyDeletionMode,
} from "@/lib/construction-operating-assistant-r30/contracts";

export const PRIVACY_DATA_CLASSES = privacyDataClassSchema.options;

export type PrivacyRule = {
  dataClass: PrivacyDataClass;
  retentionDays: number;
  deletionMode: PrivacyDeletionMode;
  holdBehavior: "BLOCK_WHILE_HELD";
};

const BASELINE: Record<PrivacyDataClass, Omit<PrivacyRule, "dataClass">> = {
  IDENTITY: { retentionDays: 3_650, deletionMode: "RETAIN", holdBehavior: "BLOCK_WHILE_HELD" },
  COMMUNICATION: { retentionDays: 730, deletionMode: "RETAIN", holdBehavior: "BLOCK_WHILE_HELD" },
  PROJECT_STATE: { retentionDays: 2_555, deletionMode: "RETAIN", holdBehavior: "BLOCK_WHILE_HELD" },
  EVIDENCE: { retentionDays: 730, deletionMode: "TOMBSTONE_WHEN_ELIGIBLE", holdBehavior: "BLOCK_WHILE_HELD" },
  FINANCIAL: { retentionDays: 2_555, deletionMode: "RETAIN", holdBehavior: "BLOCK_WHILE_HELD" },
  CONNECTOR_METADATA: { retentionDays: 365, deletionMode: "EXTERNAL_DELETE_WHEN_AUTHORIZED", holdBehavior: "BLOCK_WHILE_HELD" },
  AUDIT: { retentionDays: 3_650, deletionMode: "RETAIN", holdBehavior: "BLOCK_WHILE_HELD" },
  HUMAN_WORK: { retentionDays: 2_555, deletionMode: "RETAIN", holdBehavior: "BLOCK_WHILE_HELD" },
};

export function baselinePrivacyRules(): PrivacyRule[] {
  return PRIVACY_DATA_CLASSES.map((dataClass) => ({ dataClass, ...BASELINE[dataClass] }));
}

export function privacyRuleHash(rule: PrivacyRule): string {
  return sha256Canonical({ schemaVersion: 1, ...rule });
}

export function privacyPolicyHash(version: number, rules: readonly PrivacyRule[]): string {
  return sha256Canonical({
    schemaVersion: 1,
    version,
    rules: [...rules].sort((a, b) => a.dataClass.localeCompare(b.dataClass)),
  });
}

export function assertCompletePrivacyRules(rules: readonly PrivacyRule[]): void {
  const classes = new Set(rules.map((rule) => rule.dataClass));
  if (rules.length !== PRIVACY_DATA_CLASSES.length || classes.size !== PRIVACY_DATA_CLASSES.length) {
    throw new Error("PRIVACY_POLICY_INCOMPLETE");
  }
  for (const dataClass of PRIVACY_DATA_CLASSES) {
    const rule = rules.find((item) => item.dataClass === dataClass);
    if (!rule || rule.retentionDays <= 0) throw new Error("PRIVACY_POLICY_UNSAFE_RETENTION");
    if (["FINANCIAL", "AUDIT", "HUMAN_WORK"].includes(dataClass) && rule.deletionMode !== "RETAIN") {
      throw new Error("PRIVACY_POLICY_PROTECTED_CLASS_DELETION");
    }
    if (dataClass === "EVIDENCE" && rule.deletionMode === "EXTERNAL_DELETE_WHEN_AUTHORIZED") {
      throw new Error("PRIVACY_POLICY_EXTERNAL_EVIDENCE_DELETE_UNAUTHORIZED");
    }
  }
}
