import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../src/server/actions/admin-model-gateway.ts"),
  "utf8"
);

describe("Model Gateway admin action boundary", () => {
  it("authenticates as ADMIN before validating or mutating a breaker", () => {
    expect(source).toMatch(/^"use server";/m);
    expect(source.indexOf('await requireRole("ADMIN")')).toBeLessThan(source.indexOf("breakerActionSchema.safeParse"));
    expect(source).toContain("transitionGatewayBreaker(");
  });

  it("accepts only closed scope/state/reason vocabularies and serializes the generation", () => {
    expect(source).toContain('z.enum(["policy", "route", "model", "provider"])');
    expect(source).toContain('z.enum(["closed", "open"])');
    expect(source).toContain("generation: result.generation.toString()");
    expect(source).not.toContain("reason: z.string");
  });
});
