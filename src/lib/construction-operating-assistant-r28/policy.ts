import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import type {
  AuthorityActionKey,
  AuthorityDataClassification,
  AuthorityOutcome,
  AuthorityRole,
} from "@/lib/construction-operating-assistant-r28/contracts";

export type AuthorityActionDefinition = {
  key: AuthorityActionKey;
  version: 1;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reversible: boolean;
  externalEffectCapable: boolean;
  monetary: boolean;
  minimumRole: AuthorityRole;
  maximumDataClassification: AuthorityDataClassification;
  mandatoryOutcome: AuthorityOutcome;
};

const definitions: AuthorityActionDefinition[] = [
  { key: "INTERNAL_REMINDER_CREATE", version: 1, risk: "LOW", reversible: true, externalEffectCapable: false, monetary: false, minimumRole: "FIELD_WORKER", maximumDataClassification: "CONFIDENTIAL", mandatoryOutcome: "AUTOMATIC_INTERNAL" },
  { key: "PROJECT_FACT_CLASSIFY", version: 1, risk: "LOW", reversible: true, externalEffectCapable: false, monetary: false, minimumRole: "FIELD_WORKER", maximumDataClassification: "CONFIDENTIAL", mandatoryOutcome: "AUTOMATIC_INTERNAL" },
  { key: "PROJECT_SCHEDULE_UPDATE", version: 1, risk: "MEDIUM", reversible: true, externalEffectCapable: false, monetary: false, minimumRole: "OFFICE_MANAGER", maximumDataClassification: "CONFIDENTIAL", mandatoryOutcome: "APPROVAL_REQUIRED" },
  { key: "SEND_SMS", version: 1, risk: "MEDIUM", reversible: false, externalEffectCapable: true, monetary: false, minimumRole: "OFFICE_MANAGER", maximumDataClassification: "CONFIDENTIAL", mandatoryOutcome: "APPROVAL_REQUIRED" },
  { key: "SEND_EMAIL", version: 1, risk: "MEDIUM", reversible: false, externalEffectCapable: true, monetary: false, minimumRole: "OFFICE_MANAGER", maximumDataClassification: "CONFIDENTIAL", mandatoryOutcome: "APPROVAL_REQUIRED" },
  { key: "CALENDAR_WRITE", version: 1, risk: "MEDIUM", reversible: true, externalEffectCapable: true, monetary: false, minimumRole: "OFFICE_MANAGER", maximumDataClassification: "CONFIDENTIAL", mandatoryOutcome: "APPROVAL_REQUIRED" },
  { key: "ACCOUNTING_RECONCILE", version: 1, risk: "HIGH", reversible: true, externalEffectCapable: false, monetary: true, minimumRole: "OFFICE_MANAGER", maximumDataClassification: "RESTRICTED", mandatoryOutcome: "APPROVAL_REQUIRED" },
  { key: "ACCOUNTING_POST", version: 1, risk: "HIGH", reversible: false, externalEffectCapable: true, monetary: true, minimumRole: "OWNER", maximumDataClassification: "RESTRICTED", mandatoryOutcome: "APPROVAL_REQUIRED" },
  { key: "PAYMENT_INITIATE", version: 1, risk: "CRITICAL", reversible: false, externalEffectCapable: true, monetary: true, minimumRole: "OWNER", maximumDataClassification: "RESTRICTED", mandatoryOutcome: "PROHIBITED" },
  { key: "CONTRACT_SIGN", version: 1, risk: "CRITICAL", reversible: false, externalEffectCapable: true, monetary: false, minimumRole: "OWNER", maximumDataClassification: "RESTRICTED", mandatoryOutcome: "PROHIBITED" },
  { key: "CREDENTIAL_ACCESS", version: 1, risk: "CRITICAL", reversible: false, externalEffectCapable: true, monetary: false, minimumRole: "OWNER", maximumDataClassification: "RESTRICTED", mandatoryOutcome: "PROHIBITED" },
  { key: "DELETE_CANONICAL_RECORD", version: 1, risk: "CRITICAL", reversible: false, externalEffectCapable: false, monetary: false, minimumRole: "OWNER", maximumDataClassification: "RESTRICTED", mandatoryOutcome: "PROHIBITED" },
];

export const AUTHORITY_ACTION_REGISTRY = new Map(definitions.map((entry) => [entry.key, entry]));

const outcomeRank: Record<AuthorityOutcome, number> = {
  AUTOMATIC_INTERNAL: 0,
  APPROVAL_REQUIRED: 1,
  PROHIBITED: 2,
};

const roleRank: Record<AuthorityRole, number> = {
  FIELD_WORKER: 0,
  OFFICE_MANAGER: 1,
  OWNER: 2,
};

const dataRank: Record<AuthorityDataClassification, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

export function stricterOutcome(left: AuthorityOutcome, right: AuthorityOutcome) {
  return outcomeRank[left] >= outcomeRank[right] ? left : right;
}

export function roleMeetsMinimum(role: AuthorityRole, minimumRole: AuthorityRole) {
  return roleRank[role] >= roleRank[minimumRole];
}

export function dataClassWithinReach(actual: AuthorityDataClassification, maximum: AuthorityDataClassification) {
  return dataRank[actual] <= dataRank[maximum];
}

export function authorityPolicyHash(input: {
  version: number;
  rules: Array<{
    ruleKey: string;
    actionKey: AuthorityActionKey;
    projectId: string | null;
    roleScope: AuthorityRole | null;
    dataClassification: AuthorityDataClassification | null;
    outcome: AuthorityOutcome;
    amountCeilingMinor: number | null;
    reasonCode: string;
  }>;
}) {
  return sha256Canonical({
    schemaVersion: 1,
    namespace: "endvera-r28-authority-policy",
    version: input.version,
    rules: [...input.rules].sort((a, b) => a.ruleKey.localeCompare(b.ruleKey)),
  });
}

export function baselineAuthorityRules() {
  return definitions.map((definition) => {
    const outcome = definition.mandatoryOutcome === "PROHIBITED"
      ? "PROHIBITED" as const
      : "APPROVAL_REQUIRED" as const;
    const rule = {
      ruleKey: `BASELINE_${definition.key}`,
      actionKey: definition.key,
      projectId: null,
      roleScope: null,
      dataClassification: null,
      outcome,
      amountCeilingMinor: null,
      reasonCode: `BASELINE_${outcome}`,
    };
    return {
      ...rule,
      ruleHash: sha256Canonical({ schemaVersion: 1, ...rule }),
    };
  });
}

export function mandatoryOutcomeForDefinition(definition: AuthorityActionDefinition) {
  if (definition.externalEffectCapable && definition.mandatoryOutcome === "AUTOMATIC_INTERNAL") {
    return "APPROVAL_REQUIRED" as const;
  }
  if (!definition.reversible && definition.risk === "CRITICAL") return "PROHIBITED" as const;
  return definition.mandatoryOutcome;
}
