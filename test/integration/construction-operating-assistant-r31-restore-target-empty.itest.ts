import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("R31 disposable restore target preflight", () => {
  it("keeps the migrated target empty while exposing the closed registry", async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
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
      ORDER BY "table_name"
    `;
    expect(tables).toHaveLength(7);
    expect(await prisma.constructionWorkspace.count()).toBe(0);
    expect(await prisma.constructionReliabilitySignal.count()).toBe(0);
  });
});
