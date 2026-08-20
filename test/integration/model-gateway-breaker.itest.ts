import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  StaleGatewayBreakerGenerationError,
  transitionGatewayBreaker,
} from "@/server/model-gateway/breakers";

const scope = { scopeKind: "provider" as const, scopeKey: "synthetic" };

describe("Model Gateway breaker transitions", () => {
  it("creates an audited open transition, rejects a stale CAS, then records the close", async () => {
    await expect(
      transitionGatewayBreaker({
        scope,
        expectedGeneration: 0n,
        nextState: "open",
        reasonClass: "operator_stop",
        actorId: "admin-test",
        correlationId: "breaker-open-1",
      })
    ).resolves.toMatchObject({ generation: 1n, state: "open" });

    await expect(
      transitionGatewayBreaker({
        scope,
        expectedGeneration: 0n,
        nextState: "closed",
        reasonClass: "operator_reset",
        actorId: "admin-test",
      })
    ).rejects.toBeInstanceOf(StaleGatewayBreakerGenerationError);

    await expect(
      transitionGatewayBreaker({
        scope,
        expectedGeneration: 1n,
        nextState: "closed",
        reasonClass: "operator_reset",
        actorId: "admin-test",
        correlationId: "breaker-close-2",
      })
    ).resolves.toMatchObject({ generation: 2n, state: "closed" });

    await expect(
      prisma.modelGatewayBreakerEvent.findMany({
        where: scope,
        orderBy: { newGeneration: "asc" },
        select: { priorGeneration: true, newGeneration: true, priorState: true, newState: true, correlationId: true },
      })
    ).resolves.toEqual([
      { priorGeneration: 0n, newGeneration: 1n, priorState: "closed", newState: "open", correlationId: "breaker-open-1" },
      { priorGeneration: 1n, newGeneration: 2n, priorState: "open", newState: "closed", correlationId: "breaker-close-2" },
    ]);
  });

  it("permits only one actor to close the same open generation", async () => {
    const concurrentScope = { scopeKind: "provider" as const, scopeKey: "synthetic-concurrent" };
    await transitionGatewayBreaker({
      scope: concurrentScope,
      expectedGeneration: 0n,
      nextState: "open",
      reasonClass: "operator_stop",
      actorId: "admin-test",
    });
    const results = await Promise.allSettled([
      transitionGatewayBreaker({ scope: concurrentScope, expectedGeneration: 1n, nextState: "closed", reasonClass: "operator_reset", actorId: "admin-a" }),
      transitionGatewayBreaker({ scope: concurrentScope, expectedGeneration: 1n, nextState: "closed", reasonClass: "operator_reset", actorId: "admin-b" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(prisma.modelGatewayBreaker.findUniqueOrThrow({ where: { scopeKind_scopeKey: concurrentScope } })).resolves.toMatchObject({ generation: 2n, state: "closed" });
  });
});
