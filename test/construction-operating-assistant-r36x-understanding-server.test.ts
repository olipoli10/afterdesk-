import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("R36X server boundary", () => {
  it("has no binary, provider, network, external or automatic decision path", () => {
    const source = readFileSync(join(process.cwd(), "src/server/construction-operating-assistant-r36x/project-brain-understanding-review.ts"), "utf8");
    expect(source).not.toMatch(/(?:from\s+)?["'][^"']*(storage-local|openai|anthropic|twilio|perplexity)["']|readLocalObject|fetch\s*\(/i);
    expect(source).not.toMatch(/automatic(?:Resolution|Confirmation)Performed:\s*true/u);
    expect(source).toContain("requireReviewer");
    expect(source).toContain("CONFLICTING_RESOLUTIONS");
  });
});
