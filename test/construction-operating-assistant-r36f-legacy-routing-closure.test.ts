import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processAuthenticatedPortalCommand } from "@/server/construction-operating-assistant-r36c/orchestrator";

const commandId = "11111111-1111-4111-8111-111111111111";

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    commandId,
    workspaceId: "workspace-1",
    channel: "PORTAL",
    body: "Qu’est-ce que j’ai demain?",
    occurredAt: "2026-09-02T16:00:00.000Z",
    senderAddress: "user:owner-1",
    ...overrides,
  };
}

describe("R36F legacy command routing closure", () => {
  it("wires both authenticated legacy web boundaries through R36C", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/endvera/v1/commands/route.ts"),
      "utf8",
    );
    const action = readFileSync(
      join(process.cwd(), "src/server/actions/construction-operating-assistant-r2.ts"),
      "utf8",
    );
    for (const source of [route, action]) {
      expect(source).toContain("processAuthenticatedPortalCommand");
      expect(source).not.toContain("processOperatingAssistantCommand");
    }
  });

  it("refuses a portal sender that does not match the authenticated user", async () => {
    await expect(processAuthenticatedPortalCommand({
      userId: "owner-1",
      envelope: envelope({ senderAddress: "user:someone-else" }),
    })).rejects.toThrow("ASSISTANT_PORTAL_COMMAND_SOURCE_REFUSED");
  });

  it("refuses transport provenance at the portal boundary", async () => {
    await expect(processAuthenticatedPortalCommand({
      userId: "owner-1",
      envelope: envelope({ provider: "client-injected", providerMessageId: "message-1" }),
    })).rejects.toThrow("ASSISTANT_PORTAL_COMMAND_SOURCE_REFUSED");
  });

  it("refuses a client-selected non-portal channel before persistence", async () => {
    await expect(processAuthenticatedPortalCommand({
      userId: "owner-1",
      envelope: envelope({
        channel: "SMS",
        senderAddress: "opaque-sender",
        provider: "local-simulator",
        providerMessageId: "message-1",
      }),
    })).rejects.toThrow("ASSISTANT_PORTAL_COMMAND_SOURCE_REFUSED");
  });
});
