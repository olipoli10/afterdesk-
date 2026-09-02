import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

export type RecoveryManifest = {
  schemaIdentity: string;
  tableCounts: Record<string, number>;
  highWaterMarks: Record<string, string | null>;
  totalRows: number;
};

export function assertDisposableLocalDatabaseLabel(value: string) {
  if (!/^endvera-r31-[a-z0-9-]{1,80}$/u.test(value)) throw new Error("RECOVERY_DATABASE_NOT_DISPOSABLE");
  return value;
}

export function recoveryManifestFingerprint(value: RecoveryManifest) {
  return sha256Canonical({
    schemaIdentity: value.schemaIdentity,
    tableCounts: Object.fromEntries(Object.entries(value.tableCounts).sort(([a], [b]) => a.localeCompare(b))),
    highWaterMarks: Object.fromEntries(Object.entries(value.highWaterMarks).sort(([a], [b]) => a.localeCompare(b))),
    totalRows: value.totalRows,
  });
}

export function compareRecoveryManifests(source: RecoveryManifest, restored: RecoveryManifest) {
  const schemaMatch = source.schemaIdentity === restored.schemaIdentity;
  const countsMatch = sha256Canonical(source.tableCounts) === sha256Canonical(restored.tableCounts);
  const fingerprintMatch = recoveryManifestFingerprint(source) === recoveryManifestFingerprint(restored);
  const reasonCodes: string[] = [];
  if (!schemaMatch) reasonCodes.push("RECOVERY_SCHEMA_MISMATCH");
  if (!countsMatch) reasonCodes.push("RECOVERY_COUNTS_MISMATCH");
  if (source.totalRows !== restored.totalRows) reasonCodes.push("RECOVERY_TOTAL_ROWS_MISMATCH");
  if (!fingerprintMatch) reasonCodes.push("RECOVERY_FINGERPRINT_MISMATCH");
  return { schemaMatch, countsMatch, fingerprintMatch, reasonCodes };
}
