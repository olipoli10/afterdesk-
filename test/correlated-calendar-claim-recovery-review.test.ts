import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), configure: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: db.transaction } }));
import { recoverExpiredPersonalActionClaims } from "@/server/personal-assistant/claim-recovery";
import { correlatedCalendarApprovalStateSchema } from "@/server/personal-assistant/correlated-calendar-approval-contract";

beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Date, "now").mockReturnValue(1000);
  db.configure.mockResolvedValue(1); db.query.mockResolvedValue([]);
  db.transaction.mockImplementation(work => work({ $queryRawUnsafe: db.query, $executeRawUnsafe: db.configure }));
});
afterEach(() => vi.restoreAllMocks());
async function sql() { await recoverExpiredPersonalActionClaims({ enabled: true, batchSize: 25 }); return db.query.mock.calls[0][0] as string; }

/** Tiny closed-expression inspector, NOT PostgreSQL execution or a SQL engine.
 * Accepts only the emitted jsonb_build_object/string/bool/e."column" grammar.
 * This lets the independent oracle compare actual terminal-emitter values with
 * the real pure strict schema instead of constructing a second expected emitter. */
function inspectObjectExpression(source: string, columns: Record<string, string>): unknown {
  let at = 0;
  const whitespace = () => { while (/\s/u.test(source[at] ?? "") && at < source.length) at += 1; };
  const consume = (token: string) => { whitespace(); if (!source.startsWith(token, at)) throw new Error("EMITTER_TOKEN_INVALID"); at += token.length; };
  const value = (): unknown => {
    whitespace();
    if (source.startsWith("jsonb_build_object", at)) {
      consume("jsonb_build_object"); consume("("); const result: Record<string, unknown> = {};
      for (;;) {
        const key = value(); if (typeof key !== "string" || Object.hasOwn(result, key) || key === "__proto__") throw new Error("EMITTER_KEY_INVALID");
        consume(","); result[key] = value(); whitespace();
        if (source[at] === ")") { at += 1; return result; }
        consume(",");
      }
    }
    const literal = /^'([^']*)'/u.exec(source.slice(at));
    if (literal) { at += literal[0].length; return literal[1]; }
    const column = /^e\."([a-zA-Z]+)"/u.exec(source.slice(at));
    if (column) { at += column[0].length; if (!Object.hasOwn(columns, column[1])) throw new Error("EMITTER_COLUMN_INVALID"); return columns[column[1]]; }
    for (const boolean of ["false", "true"]) if (source.startsWith(boolean, at)) { at += boolean.length; return boolean === "true"; }
    throw new Error("EMITTER_VALUE_INVALID");
  };
  const result = value(); whitespace(); if (at !== source.length) throw new Error("EMITTER_TRAILING_INVALID"); return result;
}

describe("C1 independent source/mock review — no native SQL or provider proof", () => {
  it("the actual closed terminal expression satisfies the strict79 TypeScript union with immutable-origin scalars", async () => {
    const query = await sql(); const expression = query.split('result=CASE WHEN e."approvalId" IS NOT NULL THEN ')[1].split("ELSE (CASE")[0].trim();
    const columns = { approvalId: "01010101-0101-4101-8101-010101010101", reviewId: "review-🧱", reviewFingerprint: "a".repeat(64) };
    const emitted = correlatedCalendarApprovalStateSchema.parse(inspectObjectExpression(expression, columns));
    expect(emitted).toEqual({ version: "personal-correlated-calendar-write-state-v1", origin: { kind: "personal_sms_temporal_receipt", ...columns },
      phase: "UNCERTAIN", writeConfirmed: false, reviewRequired: true, automaticRetry: false, reason: "CLAIM_LEASE_EXPIRED" });
    expect(correlatedCalendarApprovalStateSchema.safeParse({ ...emitted, priorClaimResult: {} }).success).toBe(false);
    expect(expression).not.toContain("o.result");
  });
  it("calendar serializers are inside the typed CASE, never a legacy JSON-origin classifier", async () => {
    const query = await sql(), predicate = query.slice(query.indexOf("AND CASE WHEN"), query.indexOf("ORDER BY"));
    expect(predicate).toMatch(/^AND CASE WHEN p\."correlatedTemporalReceiptId" IS NOT NULL OR v\.id IS NOT NULL OR a\.id IS NOT NULL THEN/u);
    expect(predicate.indexOf("CASE WHEN p.kind='calendar_write'")).toBeLessThan(predicate.indexOf("THEN sms_correlated_approval_binding"));
    expect(predicate).not.toMatch(/->'?origin|priorClaimResult|jsonb_path|WITH RECURSIVE/u);
    expect(predicate).toMatch(/ELSE false END\s+ELSE true END\s*$/u);
    expect(query.match(/sms_correlated_approval_[a-z_]+\(/gu)).toEqual([
      "sms_correlated_approval_pre_snapshot(", "sms_correlated_approval_binding(", "sms_correlated_approval_state_valid(",
    ]);
  });
  it("locks only candidate operation rows and leaves immutable and mutable authority tables unwritten", async () => {
    const query = await sql();
    expect(query.match(/FOR (?:UPDATE|SHARE)[^\n]+/gu)).toEqual(['FOR UPDATE OF p SKIP LOCKED']);
    expect(query.match(/\bUPDATE\s+"[^"]+"/gu)).toEqual(['UPDATE "PersonalAssistantOperation"']);
    expect(query).not.toMatch(/INSERT INTO|DELETE FROM|pg_advisory|authority_current|ConstructionConnector|ConstructionWorkspace/u);
    const assignments = query.slice(query.indexOf("SET status"), query.indexOf("FROM expired"));
    expect(assignments).not.toMatch(/"(?:budgetId|reservedCadMicros|externalTransportPerformed|correlatedTemporalReceiptId|requestHash)"\s*=|attempts\s*=/u);
  });
  it("raw SQL79 frozen state contract exempts uncertain bookkeeping from current-authority and final expiry", () => {
    const migration = readFileSync("prisma/migrations/20260910180000_sms_correlated_calendar_approval/migration.sql", "utf8");
    expect(createHash("sha256").update(migration).digest("hex")).toBe("05163ed1dae6a7421ea3c2a1ecbd83cc7ed2abce77d6fda2cb4d34869060e1f7");
    const immediate = migration.split("ELSIF NEW.status='uncertain' THEN")[1].split("CREATE TRIGGER sms_correlated_approval_operation_guard")[0];
    expect(immediate.indexOf("RETURN NEW; -- Bookkeeping")).toBeLessThan(immediate.indexOf("sms_correlated_approval_authority_current"));
    expect(immediate).toContain("NEW.result->>'reason'='CLAIM_LEASE_EXPIRED' AND final_clock<a.\"leaseUntil\"");
    const deferred = migration.split("CREATE FUNCTION sms_correlated_approval_final_binding()")[1];
    expect(deferred.indexOf("IF o.status='uncertain'")).toBeLessThan(deferred.indexOf("sms_correlated_approval_authority_current"));
  });
  it("keeps single-query no-retry behavior when SQL79 rejects a state", async () => {
    db.query.mockRejectedValue(new Error("CORRELATED_APPROVAL_STATE_REQUIRED"));
    await expect(recoverExpiredPersonalActionClaims({ enabled: true })).rejects.toThrow("CORRELATED_APPROVAL_STATE_REQUIRED");
    expect(db.query).toHaveBeenCalledOnce(); expect(db.transaction).toHaveBeenCalledOnce();
  });
  it("a successful callback followed by unknown commit cannot return a success receipt or retry", async () => {
    db.query.mockResolvedValue([{ id: "synthetic-updated" }]);
    db.transaction.mockImplementation(async work => { await work({ $queryRawUnsafe: db.query, $executeRawUnsafe: db.configure }); throw new Error("SYNTHETIC_COMMIT_ACK_LOST"); });
    await expect(recoverExpiredPersonalActionClaims({ enabled: true })).rejects.toThrow("SYNTHETIC_COMMIT_ACK_LOST");
    expect(db.query).toHaveBeenCalledOnce(); expect(db.transaction).toHaveBeenCalledOnce();
  });
  it("deadline failure after returned updates stays inside transaction and prevents acknowledgement", async () => {
    let committed = false;
    db.query.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(1200); return [{ id: "late" }]; });
    db.transaction.mockImplementation(async work => { const result = await work({ $queryRawUnsafe: db.query, $executeRawUnsafe: db.configure }); committed = true; return result; });
    await expect(recoverExpiredPersonalActionClaims({ enabled: true, deadlineAt: 1100 })).rejects.toThrow("DEADLINE_EXCEEDED");
    expect(committed).toBe(false); expect(db.query).toHaveBeenCalledOnce();
  });
});
