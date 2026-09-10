import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const read = (folder: string) => readFileSync(path.join(process.cwd(), "prisma/migrations", folder, "migration.sql"), "utf8").replace(/\r\n/g, "\n");
const previous = read("20260910130000_sms_temporal_clarification_registry");
const forward = read("20260910140000_sms_temporal_trigger_record_dispatch");
const extract = (sql: string) => sql.match(/CREATE (?:OR REPLACE )?FUNCTION sms_temporal_final_binding\(\)[\s\S]*?END \$\$;/)?.[0] ?? "";
describe("forward-only native NEW-record dispatch correction", () => {
  it("retains applied76 and replaces exactly one function in77", () => {
    expect(previous).toContain("target:=CASE WHEN TG_TABLE_NAME=");
    expect(forward.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(forward).not.toMatch(/\b(?:DROP|ALTER|CREATE TRIGGER|DELETE FROM|UPDATE\s+")\b/);
  });
  it("guards each record field by its actual trigger table with closed fallback", () => {
    expect(forward).toContain("IF TG_TABLE_NAME='PersonalSmsTemporalClarification' THEN\n    target:=NEW.id;");
    expect(forward).toContain("ELSIF TG_TABLE_NAME='PersonalSmsTemporalClarificationReply' THEN\n    target:=NEW.\"clarificationId\";");
    expect(forward).toContain("ELSE\n    RAISE EXCEPTION 'temporal final binding trigger table refused';");
    expect(forward).not.toContain("target:=CASE");
  });
  it("preserves every final lineage/source/receipt/count/namespace check byte-for-byte", () => {
    const oldFunction = extract(previous), newFunction = extract(forward);
    expect(oldFunction.length).toBeGreaterThan(5000); expect(newFunction.length).toBeGreaterThan(5000);
    const from = '  SELECT * INTO q FROM "PersonalSmsTemporalClarification"';
    expect(newFunction.slice(newFunction.indexOf(from))).toBe(oldFunction.slice(oldFunction.indexOf(from)));
  });
});
