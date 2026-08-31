import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const serverSource = readFileSync(join(root, "specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/founder-observation-server.ts"), "utf8");

describe("loopback founder harness", () => {
  it("does not manufacture founder completion", () => {
    expect(serverSource).toContain("founderObservationSubmissionSchema.parse(JSON.parse(body))");
    expect(serverSource).toContain("observer:'Olivier'");
    expect(serverSource).not.toContain("const fixtureObservation");
  });

  it("binds only to loopback and exposes no provider", () => {
    expect(serverSource).toContain('const host = "127.0.0.1"');
    expect(serverSource).not.toMatch(/twilio|resend|fetch\([^']|https:\/\//i);
  });

  it("refuses observation replay and unknown fields", () => {
    expect(serverSource).toContain("FOUNDER_OBSERVATION_ALREADY_SEALED");
    expect(serverSource).toContain('flag: "wx"');
  });
});
