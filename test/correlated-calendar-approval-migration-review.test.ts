import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { correlatedCalendarApprovalStateSchema } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";

// Independent STATIC SQL inspection and executable JS bound oracle only.
// Does not parse/execute PostgreSQL, prove locks, or establish tuple visibility.
const sql = readFileSync("prisma/migrations/20260910180000_sms_correlated_calendar_approval/migration.sql", "utf8");
function body(name: string) {
  const match = sql.match(new RegExp(`CREATE FUNCTION ${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`));
  if (!match) throw new Error(`FUNCTION_MISSING:${name}`); return match[1];
}
const bytes = (input: unknown) => Buffer.byteLength(canonicalJson(input), "utf8");

describe("independent forward79 static boundaries, not native proof", () => {
  it("authority alone below32KiB does not imply full state below32KiB", () => {
    let vector: { authority: object; state: object } | undefined;
    for (let width = 260; width < 300 && !vector; width++) {
      const scopes = [GOOGLE_CALENDAR_WRITE_SCOPE, ...Array.from({ length: 18 }, (_, index) => `${"界".repeat(width)}${index}`)];
      const authority = { accountId: "g", accountVersion: 1, credentialId: "c", writeGrantId: "w", writeGrantVersion: 1,
        memberId: "m", memberRole: "owner", memberUpdatedAt: "2026-09-10T13:00:00.000Z", workspaceUpdatedAt: "2026-09-10T13:00:00.000Z",
        accountScopes: scopes, grantScopes: scopes };
      const state = { version: "personal-correlated-calendar-write-state-v1", phase: "CLAIMED",
        origin: { kind: "personal_sms_temporal_receipt", approvalId: "a814382a-ad16-458c-9d73-8377d2f61a93", reviewId: "review", reviewFingerprint: "a".repeat(64) },
        approvedBy: "owner", approvedHash: "b".repeat(64), approvalToken: "37de5425-c73e-4010-9b9f-74b3f04d552e", writeAuthority: authority, dispatchStarted: false };
      if (bytes(authority) <= 32768 && bytes(state) > 32768) vector = { authority, state };
    }
    expect(vector).toBeDefined(); expect(bytes(vector!.authority)).toBeLessThanOrEqual(32768);
    expect(bytes(vector!.state)).toBeGreaterThan(32768);
    expect(correlatedCalendarApprovalStateSchema.safeParse(vector!.state).success).toBe(false);
  });
  it("SQL state validator bounds full canonical envelope before phase handling", () => {
    const state = body("sms_correlated_approval_state_valid");
    expect(state).toMatch(/octet_length\(convert_to\(sms_temporal_canonical_json\(s\),'UTF8'\)\)\s*>\s*32768/);
    expect(state.indexOf("sms_temporal_canonical_json(s)")).toBeLessThan(state.indexOf("IF s->>'phase'"));
  });
  it("approval FK joins operation and actor through the same immutable review, not independent handles", () => {
    expect(sql).toContain('FOREIGN KEY ("reviewId","calendarOperationId","workspaceId","userId")');
    expect(sql).toContain('REFERENCES "PersonalSmsCorrelatedCalendarReview"(id,"calendarOperationId","workspaceId","userId") ON DELETE RESTRICT ON UPDATE RESTRICT');
    for (const key of ['"reviewId"', '"calendarOperationId"', '"approvalToken"'])
      expect(sql).toMatch(new RegExp(`CREATE UNIQUE INDEX \\w+ ON "PersonalSmsCorrelatedCalendarApproval"\\(${key}\\)`));
  });
  it("existing history no-op remains permitted but source/request/budget identity cannot be rewritten", () => {
    const guard = body("sms_correlated_approval_operation_guard");
    expect(guard).toContain("to_jsonb(NEW)-ARRAY['status','attempts','leaseUntil','result','externalTransportPerformed','updatedAt']");
    const noOp = guard.indexOf("to_jsonb(NEW)-'updatedAt'"), terminal = guard.indexOf("OLD.status NOT IN ('pending','processing')");
    expect(noOp).toBeGreaterThan(0); expect(terminal).toBeGreaterThan(noOp);
    expect(body("sms_correlated_approval_binding")).toContain('o."budgetId" IS NULL AND o."reservedCadMicros" IS NULL');
  });
  it("uncertain bookkeeping skips current authority but confirmed final state does not", () => {
    const final = body("sms_correlated_approval_final_binding");
    expect(final).toContain("IF o.status='uncertain' AND o.result->>'phase'='UNCERTAIN' AND o.\"leaseUntil\" IS NULL THEN RETURN NEW");
    expect(final.indexOf("sms_correlated_approval_authority_current")).toBeGreaterThan(final.indexOf("ELSIF o.status='completed'"));
    expect(final.indexOf("final_clock:=" )).toBeGreaterThan(final.indexOf("sms_correlated_approval_authority_current"));
  });
  it("mutable grant inspection does not secretly take calendar-to-namespace locks", () => {
    const source = sql.replace(/--[^\n]*/g, "");
    expect(source).not.toMatch(/pg_(?:try_)?advisory|FOR\s+(?:NO\s+KEY\s+UPDATE|KEY\s+SHARE|UPDATE|SHARE)|LOCK\s+TABLE/i);
    expect(body("sms_correlated_approval_authority_current")).toContain("m.status='active' AND m.role='owner'");
    expect(body("sms_correlated_approval_authority_current")).toContain('w."ownerUserId"=a."userId"');
  });
  it("commit-origin helper is scoped to a SELECT-visible tuple under SERIALIZABLE, not an arbitrary commit oracle", () => {
    const helper = body("sms_correlated_approval_pre_snapshot");
    expect(helper).toContain("current_setting('transaction_isolation')<>'serializable'");
    expect(helper).toContain("age(row_xmin)>age(pg_snapshot_xmax(pg_current_snapshot())::xid)");
    expect(sql).toContain('SELECT xmin INTO review_xmin FROM "PersonalSmsCorrelatedCalendarReview" WHERE id=v.id');
    expect(sql).toContain('SELECT xmin INTO operation_xmin FROM "PersonalAssistantOperation" WHERE id=target');
    expect(sql.replace(/--[^\n]*/g, "")).not.toMatch(/pg_xact_status\(|pg_visible_in_snapshot\(/);
  });
});
