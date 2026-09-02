import "server-only";
import type { Prisma } from "@prisma-client";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  recoveryManifestFingerprint,
  type RecoveryManifest,
} from "@/lib/construction-operating-assistant-r31/recovery";

export const RECOVERY_CHECKPOINT_REGISTRY_VERSION = 1 as const;

const RECOVERY_TABLE_NAMES = [
  "ConstructionFollowUp",
  "ConstructionFollowUpAttempt",
  "ConstructionFollowUpTransition",
  "ConstructionConnectorOperation",
  "ConstructionReliabilitySignal",
  "ConstructionReliabilityAlert",
  "ConstructionRecoveryOperation",
] as const;

type CountAndMark = { count: number; mark: string | null };

async function countAndMark(
  count: Promise<number>,
  latest: Promise<{ id: string; createdAt: Date } | null>,
): Promise<CountAndMark> {
  const [rowCount, row] = await Promise.all([count, latest]);
  return { count: rowCount, mark: row ? `${row.createdAt.toISOString()}:${row.id}` : null };
}

export async function buildRecoveryManifest(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<RecoveryManifest> {
  const presentTables = await tx.$queryRaw<Array<{ table_name: string }>>`
    SELECT "table_name"
    FROM "information_schema"."tables"
    WHERE "table_schema" = 'public'
      AND "table_name" IN (
        'ConstructionFollowUp',
        'ConstructionFollowUpAttempt',
        'ConstructionFollowUpTransition',
        'ConstructionConnectorOperation',
        'ConstructionReliabilitySignal',
        'ConstructionReliabilityAlert',
        'ConstructionRecoveryOperation'
      )
    ORDER BY "table_name" ASC
  `;
  const present = new Set(presentTables.map((row) => row.table_name));
  const missing = RECOVERY_TABLE_NAMES.filter((name) => !present.has(name));
  if (missing.length > 0) throw new Error(`RECOVERY_CHECKPOINT_REGISTRY_INCOMPLETE:${missing.join(",")}`);
  const migrationTable = await tx.$queryRaw<Array<{ relation_name: string | null }>>`
    SELECT to_regclass('public._prisma_migrations')::text AS "relation_name"
  `;
  const migrationRows = migrationTable[0]?.relation_name
    ? await tx.$queryRaw<Array<{ migration_name: string; checksum: string }>>`
        SELECT "migration_name", "checksum"
        FROM "_prisma_migrations"
        WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
        ORDER BY "finished_at" ASC, "migration_name" ASC
      `
    : [{ migration_name: "MANUAL_DISPOSABLE_MIGRATION_CHAIN", checksum: "R31_INTEGRATION_HARNESS" }];
  if (migrationRows.length === 0) throw new Error("RECOVERY_MIGRATION_IDENTITY_MISSING");
  const schemaIdentity = sha256Canonical({ registryVersion: RECOVERY_CHECKPOINT_REGISTRY_VERSION, tables: RECOVERY_TABLE_NAMES, migrationRows });

  const rows = await Promise.all([
    countAndMark(
      tx.constructionFollowUp.count({ where: { workspaceId } }),
      tx.constructionFollowUp.findFirst({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true } }),
    ),
    countAndMark(
      tx.constructionFollowUpAttempt.count({ where: { workspaceId } }),
      tx.constructionFollowUpAttempt.findFirst({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true } }),
    ),
    countAndMark(
      tx.constructionFollowUpTransition.count({ where: { workspaceId } }),
      tx.constructionFollowUpTransition.findFirst({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true } }),
    ),
    countAndMark(
      tx.constructionConnectorOperation.count({ where: { workspaceId } }),
      tx.constructionConnectorOperation.findFirst({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true } }),
    ),
    countAndMark(
      tx.constructionReliabilitySignal.count({ where: { workspaceId } }),
      tx.constructionReliabilitySignal.findFirst({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true } }),
    ),
    countAndMark(
      tx.constructionReliabilityAlert.count({ where: { workspaceId } }),
      tx.constructionReliabilityAlert.findFirst({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true } }),
    ),
    countAndMark(
      tx.constructionRecoveryOperation.count({ where: { workspaceId } }),
      tx.constructionRecoveryOperation.findFirst({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true } }),
    ),
  ]);
  const tableCounts = Object.fromEntries(RECOVERY_TABLE_NAMES.map((name, index) => [name, rows[index]!.count]));
  const highWaterMarks = Object.fromEntries(RECOVERY_TABLE_NAMES.map((name, index) => [name, rows[index]!.mark]));
  const totalRows = Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
  return { schemaIdentity, tableCounts, highWaterMarks, totalRows };
}

export function fingerprintRecoveryManifest(manifest: RecoveryManifest) {
  return recoveryManifestFingerprint(manifest);
}
