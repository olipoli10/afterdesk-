import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("R36W server boundary", () => {
  it("has no binary storage, model provider, network or automatic confirmation path", () => {
    const source = readFileSync(join(process.cwd(), "src/server/construction-operating-assistant-r36w/project-brain-fact-candidates.ts"), "utf8");
    expect(source).not.toMatch(/(?:from\s+)?["'][^"']*(storage-local|openai|anthropic|twilio|perplexity)["']|readLocalObject|fetch\s*\(/i);
    expect(source).not.toMatch(/automaticConfirmationPerformed:\s*true/);
    expect(source).not.toMatch(/candidate[^\n]*status:\s*["']CONFIRMED["']/i);
  });
});
