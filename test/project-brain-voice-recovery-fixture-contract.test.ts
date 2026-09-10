import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const directory = resolve(process.cwd(), "specs/210-personal-live-activation");
const fixture = readFileSync(resolve(directory, "project-brain-voice-recovery.fixture.ts"), "utf8");
describe("native recovery fixture preparation, no database execution", () => {
  it("keeps the exact existing 770-byte synthetic AAC fixture", () => {
    const original = readFileSync(resolve(directory, "project-brain-voice-gateway.postgres.test.ts"), "utf8");
    const extract = (text: string) => Buffer.from(text.match(/const audio = Buffer.from\("([^"]+)"/)![1], "base64");
    const bytes = extract(fixture);
    expect(bytes).toEqual(extract(original)); expect(bytes.byteLength).toBe(770);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("1c07581d232ce200f1a386faf4fd3f94bed3fc68be243ad6076ab0c7e578f5bb");
  });
  it("creates a future short lease and waits for actual DB expiry without forging an admission", () => {
    expect(fixture).toContain("+interval '200 milliseconds'");
    expect(fixture).not.toContain("-interval '1 second'");
    expect(fixture).toContain("remaining.ms > 1500");
    expect(fixture).toContain("SELECT pg_sleep($1::double precision)::text");
    expect(fixture).toContain('"lockedBy"=$2 AND status=\'running\' AND attempts=1');
    expect(fixture).not.toMatch(/a\.deadline\s*=|a\.claim\s*=/);
  });
  it("registers no tests, mocks or hooks and uses the actual physical usage field", () => {
    expect(fixture).not.toMatch(/from\s+["'][^"']*\.test|\bvi\.mock|\bdescribe\(|\bafterAll\(/);
    expect(fixture).toContain('requirePersonalDisposableDatabase();');
    expect(fixture).toContain('prisma.aiUsage.findMany({ where: { operationId: ai.id } })');
  });
});
