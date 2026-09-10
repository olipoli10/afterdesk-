import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(resolve(process.cwd(), `src/server/model-gateway/${name}.ts`), "utf8");

describe("personal gateway UTC-naive raw SQL contract (static, native proof separate)", () => {
  it.each(["personal-ai-operations", "personal-intent/admission", "personal-intent/dispatch", "personal-intent/recovery", "personal-intent/review-consumer", "operations", "evidence", "breakers"])("normalizes each SQL now() into the UTC-naive storage convention in %s", name => {
    const source = read(name);
    expect(source).toContain("(now() AT TIME ZONE 'UTC')");
    expect(source).not.toMatch(/now\(\)(?! AT TIME ZONE 'UTC')/);
  });
  it("pins raw Date parameters on admission and post-latency dispatch, not just database clocks", () => {
    const admission = read("personal-intent/admission");
    expect(admission).toContain("($3::timestamptz AT TIME ZONE 'UTC')");
    expect(admission).toContain('"expiresAt"=($4::timestamptz AT TIME ZONE \'UTC\')');
    const dispatch = read("personal-intent/dispatch");
    expect(dispatch).toContain('"leaseUntil"=($2::timestamptz AT TIME ZONE \'UTC\')');
    expect(dispatch).toContain('b."expiresAt"=($9::timestamptz AT TIME ZONE \'UTC\')');
  });
  it("keeps returned SQL clocks as genuine instants rather than locale-dependent naive Dates", () => {
    expect(read("personal-intent/admission")).toContain("SELECT CURRENT_TIMESTAMP AS now");
    expect(read("personal-intent/review-consumer")).toContain("CURRENT_TIMESTAMP AS now");
  });
});
