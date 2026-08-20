import "server-only";
import { randomUUID } from "node:crypto";
import type { LedgerKind, Prisma } from "@prisma-client";

type LedgerInput = {
  kind: LedgerKind;
  amountCents: number;
  currency: string;
  sourceKind: string;
  sourceId: string;
  taskId?: string;
  categoryId?: string | null;
  categorySlug?: string | null;
  categoryName?: string | null;
  isInternal?: boolean;
  publiclyVisible?: boolean;
};

/**
 * The migration-owned BEFORE INSERT trigger assigns seq, occurredAt and both
 * hashes. Placeholders satisfy Prisma/Postgres input shape before the trigger
 * overwrites them. The source pair makes webhook redelivery idempotent.
 */
export async function insertLedgerEntry(
  tx: Prisma.TransactionClient,
  input: LedgerInput
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "LedgerEntry" (
      "id", "seq", "kind", "amountCents", "currency",
      "categoryId", "categorySlug", "categoryName",
      "sourceKind", "sourceId", "occurredAt",
      "isInternal", "publiclyVisible", "prevHash", "rowHash", "createdAt"
    )
    SELECT
      ${randomUUID()}, 0, ${input.kind}::"LedgerKind", ${input.amountCents}, ${input.currency},
      ${input.categoryId ?? null}, ${input.categorySlug ?? null}, ${input.categoryName ?? null},
      ${input.sourceKind}, ${input.sourceId}, NOW(),
      ${input.isInternal ?? false}, ${input.publiclyVisible ?? true}, '', '', NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM "LedgerEntry"
      WHERE "sourceKind" = ${input.sourceKind} AND "sourceId" = ${input.sourceId}
    )
  `;
}

