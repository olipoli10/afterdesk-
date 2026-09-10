import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { fingerprintVoiceGatewayProjection } from "@/server/model-gateway/privacy";
import { voiceOperationKey } from "@/server/model-gateway/voice/operations";
const m = vi.hoisted(() => ({ tx: vi.fn(), query: vi.fn(), execute: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.tx } }));
vi.mock("@/server/model-gateway/evidence", async original => ({ ...await original<typeof import("@/server/model-gateway/evidence")>(), appendGatewayAuditEvent: m.audit }));
import { recoverExpiredProjectBrainVoiceAttempts as recover } from "@/server/model-gateway/voice/project-brain-recovery";

// Author-compatible metadata contract, distinct reviewer transaction/commit oracles.
function fixture(id: string) {
  const subject = { kind: "project_brain_voice_segment" as const, actorUserId: "owner", workspaceId: "workspace", projectId: "project", intakeId: "intake",
    sourceId: `source-${id}`, sessionId: `session-${id}`, segmentId: `segment-${id}`, sourceBindingHash: "a".repeat(64), segmentManifestHash: "b".repeat(64) };
  const projection = { operationType: "intake_voice_transcription" as const, sessionId: subject.sessionId, segmentId: subject.segmentId, ordinal: 0,
    languageHint: "fr" as const, mediaFormat: "wav" as const, mimeType: "audio/wav", durationMs: 1000, byteCount: 4, audioFingerprint: `sha256:${"c".repeat(64)}` as const };
  const requestFingerprint = fingerprintVoiceGatewayProjection(projection, subject), routeHash = `sha256:${"d".repeat(64)}`, outputContractHash = `sha256:${"e".repeat(64)}`;
  return { ...subject, ...projection, aiId: id, operationKey: voiceOperationKey(projection), lockedBy: `nonce-${id}`, lockedAt: new Date("2026-09-10T11:00:00Z"),
    leaseExpiresAt: new Date("2026-09-10T11:59:59Z"), gatewayId: `gateway-${id}`, tenantId: "construction-workspace:workspace", requestFingerprint, outputContractHash,
    decisionId: `decision-${id}`, policyHash: `sha256:${"f".repeat(64)}`, routeHash, attemptId: `attempt-${id}`, holdId: `hold-${id}`,
    amountMicros: 100000n, periodKey: "2026-09-09", sessionStatus: "transcribing", attemptStatus: "prepared", dispatchState: "not_dispatched", segmentStatus: "registered",
    requestEvidenceRef: canonicalFingerprint({ operationType: projection.operationType, requestFingerprint, outputContractHash, routeHash }) };
}
let rows: ReturnType<typeof fixture>[], staged: string[], committed: string[];
const options = () => ({ enabled: true, environment: "local" as const });
const tx = { $queryRawUnsafe: m.query, $executeRawUnsafe: m.execute };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime("2026-09-10T12:00:00Z");
  rows = [fixture("a"), fixture("b")]; staged = []; committed = [];
  m.tx.mockImplementation(async work => { try { const result = await work(tx); committed = [...staged]; return result; } catch (error) { staged = []; throw error; } });
  m.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
    if (sql.includes("set_config(")) return [];
    if (sql.includes("pg_try_advisory")) return [{ acquired: true }];
    if (sql.includes("FOR UPDATE OF ai,v,s,o,t")) return rows.filter(row => row.aiId === args[0]).map(row => structuredClone(row));
    if (sql.includes('SELECT id FROM "AccountProviderSpendHold"')) return [{ id: args[0] }];
    if (sql.includes('ORDER BY ai."leaseExpiresAt",ai.id LIMIT')) return rows.map(row => ({ aiId: row.aiId, sessionId: row.sessionId, lockedBy: row.lockedBy, leaseExpiresAt: new Date(row.leaseExpiresAt) }));
    throw new Error("UNEXPECTED_REVIEW_QUERY");
  });
  m.execute.mockImplementation(async (_sql: string, id: string) => { staged.push(id); return 1; });
  m.audit.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

describe("independent PB expired-claim recovery (synthetic transaction acknowledgements)", () => {
  it("all quoted lineage SQL columns resolve to real stored Prisma fields, not relation aliases", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const source = readFileSync("src/server/model-gateway/voice/project-brain-recovery.ts", "utf8");
    const types = new Set(["String", "Int", "Float", "Boolean", "BigInt", "DateTime", "Json", "Bytes", ...[...schema.matchAll(/^enum (\w+)\s*\{/gm)].map(match => match[1])]);
    const aliases = { ai: "AiOperation", s: "VoiceIntakeSegment", v: "VoiceIntakeSession", src: "ConstructionProjectBrainSource", o: "ModelGatewayOperation",
      d: "ModelGatewayDecision", r: "ModelGatewayRouteProfile", p: "ModelGatewayPolicyVersion", t: "ModelGatewayAttempt", h: "AccountProviderSpendHold", x: "VoiceTranscriptSegment", u: "AiUsage" };
    const missing: string[] = [];
    for (const [alias, model] of Object.entries(aliases)) {
      const block = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "m").exec(schema)?.[1];
      expect(block, model).toBeDefined();
      const columns = new Set([...block!.matchAll(/^\s{2}(\w+)\s+(\w+)(?:\[\])?\??([^\r\n]*)/gm)]
        .filter(match => types.has(match[2])).map(match => /@map\("([^"\n]+)"\)/.exec(match[3])?.[1] ?? match[1]));
      for (const match of source.matchAll(new RegExp(`\\b${alias}\\."([^"]+)"`, "g"))) {
        if (!columns.has(match[1])) missing.push(`${model}.${match[1]}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
    const migration = readFileSync("prisma/migrations/20260807100000_operational_intelligence/migration.sql", "utf8");
    expect(migration).toContain('FOREIGN KEY ("operationId") REFERENCES "AiOperation"("id")');
    expect(source).toContain('FROM "AiUsage" u WHERE u."operationId"=ai.id');
  });
  it("an audit failure on the second claim rolls back the whole batch, including the first claim", async () => {
    m.audit.mockImplementation(async (_tx, event) => { if (event.gatewayOperationId === "gateway-b") throw new Error("synthetic audit failure"); return {}; });
    await expect(recover(options())).rejects.toThrow("synthetic audit failure");
    expect(m.audit).toHaveBeenCalledTimes(2); expect(m.execute).toHaveBeenCalledTimes(10);
    expect(staged).toEqual([]); expect(committed).toEqual([]); expect(m.tx).toHaveBeenCalledTimes(1);
  });
  it("an unknown commit acknowledgement never returns a recovered count or triggers compensation/retry", async () => {
    m.tx.mockImplementation(async work => { await work(tx); committed = [...staged]; throw new Error("synthetic acknowledgement lost"); });
    await expect(recover(options())).rejects.toThrow("synthetic acknowledgement lost");
    expect(committed).toHaveLength(10); expect(m.tx).toHaveBeenCalledTimes(1); expect(m.audit).toHaveBeenCalledTimes(2);
  });
  it("recovery accepts an old held period without requesting a new current-day reservation", async () => {
    expect(await recover(options())).toMatchObject({ recovered: 2, budgetReservationReleased: false, transportPerformedByRecovery: false });
    const holdCalls = m.query.mock.calls.filter(([sql]) => sql.includes('SELECT id FROM "AccountProviderSpendHold"'));
    expect(holdCalls.map(call => call[4])).toEqual(["2026-09-09", "2026-09-09"]);
    expect(m.execute.mock.calls.every(([sql]) => !sql.includes('"AccountProviderSpendHold"'))).toBe(true);
  });
  it("every terminal AI CAS carries the exact original nonce and UTC lease while preserving these evidence fields", async () => {
    await recover(options());
    const aiCalls = m.execute.mock.calls.filter(([sql]) => sql.startsWith('UPDATE "AiOperation"'));
    expect(aiCalls).toHaveLength(2);
    aiCalls.forEach(([sql, id, nonce, lease, segment, key], index) => {
      const row = rows[index]; expect([id, nonce, lease, segment, key]).toEqual([row.aiId, row.lockedBy, row.leaseExpiresAt, row.segmentId, row.operationKey]);
      expect(sql).toContain('"leaseExpiresAt"=($3::timestamptz AT TIME ZONE \'UTC\')');
      expect(sql.slice(0, sql.indexOf("WHERE"))).not.toMatch(/lockedBy|leaseExpiresAt|lockedAt|lastError|resultId|resultKind/);
    });
  });
  it("caller deadline mutation after the first await cannot extend the original bounded controller window", async () => {
    const input = { ...options(), deadlineAt: Date.now() + 1000 };
    const original = m.query.getMockImplementation()!;
    m.query.mockImplementation(async (sql, ...args) => { const result = await original(sql, ...args); if (sql.includes("set_config(")) input.deadlineAt += 60000; return result; });
    m.audit.mockImplementation(async () => { vi.setSystemTime(Date.now() + 1000); return {}; });
    await expect(recover(input)).rejects.toThrow("DEADLINE_EXCEEDED");
    expect(committed).toEqual([]);
  });
});
