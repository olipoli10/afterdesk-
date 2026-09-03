type UnknownRecord = Record<string, unknown>;

const SIGNAL_CODES = [
  "WEB_LIVENESS",
  "AUTH_OUTCOME",
  "API_LATENCY_BUCKET",
  "BACKGROUND_JOB_STATE",
  "OUTBOX_STATE",
  "MOBILE_SYNC_STATE",
  "DATABASE_OPERATION_STATE",
  "SUPPORT_HANDOFF_STATE",
] as const;

const INCIDENT_LEVELS = ["SEV0", "SEV1", "SEV2", "SEV3"] as const;
const SUPPORT_FIELDS = ["incidentId", "workspaceOpaqueRef", "actorOpaqueRef", "releaseVersion", "signalCode", "severity", "occurredAtBucket", "reproductionCode"] as const;

function record(value: unknown, code: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as UnknownRecord;
}

function array(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(code);
  return value;
}

function exact(values: unknown[], expected: readonly string[]) {
  return JSON.stringify(values) === JSON.stringify(expected);
}

export function validateReleaseOperationsReadiness(input: unknown) {
  const contract = record(input, "RELEASE_OPERATIONS_INVALID");
  if (contract.schemaVersion !== 1 || contract.readiness !== "READY_FOR_MONITORING_PROVIDER_SELECTION" || contract.providerSelected !== false || contract.deployed !== false || contract.externallyObserved !== false || contract.externalEffectCount !== 0) throw new Error("RELEASE_OPERATIONS_CLAIM_INFLATION_REFUSED");

  const signals = array(contract.signals, "RELEASE_OPERATIONS_SIGNAL_DRIFT").map((value) => record(value, "RELEASE_OPERATIONS_SIGNAL_DRIFT"));
  if (!exact(signals.map((item) => item.code), SIGNAL_CODES) || signals.some((item) => item.contentPolicy !== "METADATA_ONLY_REDACTED" || !Array.isArray(item.dimensions))) throw new Error("RELEASE_OPERATIONS_SIGNAL_DRIFT");

  const adapters = array(contract.adapters, "RELEASE_OPERATIONS_ADAPTER_ENABLED_REFUSED").map((value) => record(value, "RELEASE_OPERATIONS_ADAPTER_ENABLED_REFUSED"));
  if (adapters.length !== 5 || adapters.some((item) => item.status !== "DISABLED_CONFIG_ONLY" || item.endpoint !== null || item.credentialReference !== null)) throw new Error("RELEASE_OPERATIONS_ADAPTER_ENABLED_REFUSED");

  const levels = array(contract.incidentLevels, "RELEASE_OPERATIONS_INCIDENT_CONTRACT_INCOMPLETE").map((value) => record(value, "RELEASE_OPERATIONS_INCIDENT_CONTRACT_INCOMPLETE"));
  if (!exact(levels.map((item) => item.level), INCIDENT_LEVELS) || levels.some((item) => typeof item.ownerClass !== "string" || typeof item.responseTargetMinutes !== "number" || item.responseTargetMinutes <= 0)) throw new Error("RELEASE_OPERATIONS_INCIDENT_CONTRACT_INCOMPLETE");

  const triggers = array(contract.rollbackTriggers, "RELEASE_OPERATIONS_ROLLBACK_INCOMPLETE");
  if (!["EXTERNAL_EFFECT_WITHOUT_AUTHORITY", "CROSS_WORKSPACE_DISCLOSURE", "CANONICAL_STATE_CORRUPTION"].every((code) => triggers.includes(code))) throw new Error("RELEASE_OPERATIONS_ROLLBACK_INCOMPLETE");

  const handoff = record(contract.supportHandoff, "RELEASE_OPERATIONS_SUPPORT_DISCLOSURE_REFUSED");
  if (handoff.publicPath !== "/construction/support" || handoff.automaticExternalSend !== false || handoff.rawMessageBodyAllowed !== false || handoff.rawEvidenceAllowed !== false || !exact(array(handoff.allowedFields, "RELEASE_OPERATIONS_SUPPORT_DISCLOSURE_REFUSED"), SUPPORT_FIELDS)) throw new Error("RELEASE_OPERATIONS_SUPPORT_DISCLOSURE_REFUSED");

  return { status: contract.readiness, signalCount: signals.length, adapterCount: adapters.length, externalEffectCount: 0 };
}
