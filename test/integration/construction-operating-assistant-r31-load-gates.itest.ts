import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { evaluateReliabilityGate } from "@/lib/construction-operating-assistant-r31/gates";
import { processReliabilityCommand, recordReliabilitySignal } from "@/server/construction-operating-assistant-r31/reliability";

const operationCount = 500;
const concurrency = 20;
const replayCount = 50;

describe("R31 bounded reliability load gate on disposable PostgreSQL", () => {
  it("persists exactly 500 canonical effects, refuses duplicate effects and records denominators", async () => {
    const runId = crypto.randomUUID();
    const owner = await prisma.user.create({ data: {
      name: "R31 load owner",
      email: `r31-load-${runId}@example.invalid`,
      role: "CLIENT",
    } });
    const workspace = await prisma.constructionWorkspace.create({ data: {
      ownerUserId: owner.id,
      name: `R31 load ${runId}`,
      members: { create: { userId: owner.id, role: "owner", status: "active" } },
    }, select: { id: true } });
    const prefix = `load-gate:${runId}:`;
    const latenciesMs: number[] = [];
    const startedAt = performance.now();

    for (let offset = 0; offset < operationCount; offset += concurrency) {
      const batch = Array.from({ length: Math.min(concurrency, operationCount - offset) }, (_, index) => offset + index);
      const measured = await Promise.all(batch.map(async (sequence) => {
        const began = performance.now();
        const result = await recordReliabilitySignal({ userId: owner.id, signal: {
          schemaVersion: 1,
          workspaceId: workspace.id,
          signalKey: `${prefix}${sequence}`,
          kind: "STATE_TRANSITION",
          severity: "INFO",
          outcomeCode: "ALERT_RESOLVED",
          traceId: `${runId}:${sequence}`,
          spanId: `${runId}:${sequence}:signal`,
          parentSpanId: null,
          sourceModule: "load-gate-r31",
          resourceType: "WORKSPACE",
          resourceId: workspace.id,
          resourceVersion: 1,
          durationMs: null,
          dimensions: { operationKind: "SIGNAL", itemVersion: 1 },
          observedAt: new Date(Date.UTC(2026, 8, 2, 12, 0, 0, sequence)).toISOString(),
        } });
        return { created: result.created, latencyMs: Math.max(0, Math.round(performance.now() - began)) };
      }));
      for (const result of measured) {
        expect(result.created).toBe(true);
        latenciesMs.push(result.latencyMs);
      }
    }

    const replayed = await Promise.all(Array.from({ length: replayCount }, (_, sequence) => recordReliabilitySignal({ userId: owner.id, signal: {
      schemaVersion: 1,
      workspaceId: workspace.id,
      signalKey: `${prefix}${sequence}`,
      kind: "STATE_TRANSITION",
      severity: "INFO",
      outcomeCode: "ALERT_RESOLVED",
      traceId: `${runId}:${sequence}`,
      spanId: `${runId}:${sequence}:signal`,
      parentSpanId: null,
      sourceModule: "load-gate-r31",
      resourceType: "WORKSPACE",
      resourceId: workspace.id,
      resourceVersion: 1,
      durationMs: null,
      dimensions: { operationKind: "SIGNAL", itemVersion: 1 },
      observedAt: new Date(Date.UTC(2026, 8, 2, 12, 0, 0, sequence)).toISOString(),
    } })));
    expect(replayed.every((result) => !result.created)).toBe(true);

    const canonicalEffectCount = await prisma.constructionReliabilitySignal.count({
      where: { workspaceId: workspace.id, signalKey: { startsWith: prefix } },
    });
    const gate = evaluateReliabilityGate({
      operationCount,
      concurrency,
      canonicalEffectCount,
      duplicateCount: replayCount,
      durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
      latenciesMs,
      thresholdMs: 5_000,
    });
    expect(gate).toMatchObject({ status: "PASSED", canonicalEffectCount: operationCount, duplicateCount: replayCount });

    const persisted = await processReliabilityCommand({ userId: owner.id, command: {
      schemaVersion: 1,
      action: "RECORD_GATE_RUN",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.id,
      gateKey: `signal-concurrency:${runId}`,
      gateKind: "SIGNAL_CONCURRENCY",
      operationCount,
      concurrency,
      canonicalEffectCount,
      duplicateCount: replayCount,
      durationMs: gate.durationMs,
      p50LatencyMs: gate.p50LatencyMs,
      p95LatencyMs: gate.p95LatencyMs,
      thresholdMs: gate.thresholdMs,
      status: gate.status,
      resultFingerprint: gate.resultFingerprint,
    }, referenceNow: new Date("2026-09-02T13:00:00.000Z") });
    expect(persisted).toMatchObject({
      resultType: "GATE_RUN",
      status: "PASSED",
      operationCount,
      concurrency,
      canonicalEffectCount,
      duplicateCount: replayCount,
      evidenceLabel: "SYNTHETIC",
      externalEffectCount: 0,
    });
  }, 180_000);
});
