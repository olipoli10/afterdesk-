import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { R37_CASES } from "@/lib/construction-operating-assistant-r37/cases";
import { R37_MODELS } from "@/lib/construction-operating-assistant-r37/contracts";
import { dispatchOpenRouterRequest } from "@/lib/construction-operating-assistant-r37/transport";
import { buildCorrectedOpenRouterRequest } from "@/lib/construction-operating-assistant-r37bb/contracts";

const validOutput = {
  answer: "The file is not ready to invoice because written approval and work proof are missing.",
  citedFactIds: ["F-101", "F-102", "F-103"],
  proposedCapability: "CLARIFY" as const,
  limitations: ["No external action was performed."],
};

describe("R37 corrected retest transport", () => {
  it("uses the corrected strict-ZDR request without changing historical default semantics", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: "gen-r37-corrected-1",
      model: R37_MODELS[0],
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(validOutput) } }],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140, cost: 0.001 },
    }), { status: 200 }));

    await dispatchOpenRouterRequest({
      modelId: R37_MODELS[0],
      observedCase: R37_CASES[0],
      requestVersion: "R37BB_CORRECTED",
      fetchImpl,
      credentialResolver: () => "local-test-secret-never-persist",
      now: () => new Date("2026-09-05T12:00:00.000Z"),
    });

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toEqual(buildCorrectedOpenRouterRequest(R37_MODELS[0], R37_CASES[0]));
    expect(body).toHaveProperty("max_completion_tokens", 512);
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
  });

  it("keeps the sealed original report immutable and uses a separate evidence path", () => {
    const runner = readFileSync("scripts/run-r37-corrected-openrouter-retest.ts", "utf8");
    expect(runner).toContain("specs/194-corrected-openrouter-retest");
    expect(runner).toContain("bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3");
    expect(runner).not.toContain('resolve(evidenceRoot, "../192-openrouter-provider-sandbox/evidence/observed-provider-report.json")');
    const launcher = readFileSync("scripts/start-r37-corrected-openrouter-retest-secure.ps1", "utf8");
    expect(launcher).toContain("System.Windows.Forms.Form");
    expect(launcher).toContain("UseSystemPasswordChar = $true");
    expect(launcher).not.toContain("Read-Host");
    expect(launcher).not.toContain("Get-Credential");
    const localWeb = readFileSync("scripts/start-r37-corrected-openrouter-retest-local-web.mjs", "utf8");
    expect(localWeb).toContain('listen(PORT, HOST');
    expect(localWeb).toContain('const START_PATH = "/r37-corrected-retest"');
    expect(localWeb).toContain('type="password"');
    expect(localWeb).toContain('"cache-control": "no-store, max-age=0"');
    expect(localWeb).toContain("R37_OPENROUTER_CONTROLLER_API_KEY: key");
    expect(localWeb).toContain('replace(/sk-or-v1-[A-Za-z0-9_-]+/gu, "[REDACTED]")');
    expect(localWeb).not.toMatch(/console\.log\([^)]*key/u);
  });
});
