import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("R36Y assistant memory server boundary", () => {
  it("revalidates confirmed memory and cannot reach providers, binaries, approval or delivery", () => {
    const source = readFileSync(join(process.cwd(), "src/server/construction-operating-assistant-r36y/project-brain-assistant-memory.ts"), "utf8");
    expect(source).toContain("loadCurrentConfirmedMemory");
    expect(source).toContain("assertConfirmedMemoryIntegrity");
    expect(source).toContain("PREPARED_UNSENT");
    expect(source).not.toMatch(/(?:from\s+)?["'][^"']*(openai|anthropic|twilio|perplexity|storage-local)["']|readLocalObject|fetch\s*\(/i);
    expect(source).not.toMatch(/(?:approvalPerformed|externalTransportPerformed|providerExecutionPerformed|binaryUnderstandingPerformed):\s*true/u);
  });
});
