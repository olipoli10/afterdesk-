import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), consumeRateLimit: vi.fn(), command: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: mocks.getSessionUser, consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/server/construction-operating-assistant-r36y/project-brain-assistant-memory", () => ({
  applyProjectBrainAssistantCommandForUser: mocks.command,
  projectBrainAssistantMemoryForUser: mocks.read,
}));

import { POST } from "@/app/api/endvera/v1/mobile/assistant/route";
import { GET, dynamic, runtime } from "@/app/api/endvera/v1/mobile/assistant/project-memory/route";

const hash = "a".repeat(64);
const command = { schemaVersion: 1, action: "RECALL_CONFIRMED_PROJECT_MEMORY", commandId: "127600fe-d3a1-4a29-928e-4810d8635e72", workspaceId: "workspace-a", projectId: "project-a", expectedConfirmedUnderstandingSequence: 7, expectedMemoryCanonicalHash: hash, questionKind: "NEXT_DECISION" };
const request = (body: unknown) => new Request("http://localhost/api/endvera/v1/mobile/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("R36Y assistant memory API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getSessionUser.mockResolvedValue({ id: "owner-a", role: "CLIENT", emailVerified: true }); mocks.consumeRateLimit.mockResolvedValue(true); mocks.command.mockResolvedValue({ replayed: false }); mocks.read.mockResolvedValue({ schemaVersion: 1, currentMemory: null, recallHistory: [], preparedActions: [] }); });

  it("accepts strict structured memory commands on the unified assistant route", async () => {
    expect((await POST(request(command)))!.status).toBe(201);
    expect(mocks.command).toHaveBeenCalledWith({ userId: "owner-a", command });
    expect((await POST(request({ ...command, unknown: true })))!.status).toBe(400);
  });

  it("resolves current memory only from workspace/project navigation", async () => {
    expect(runtime).toBe("nodejs"); expect(dynamic).toBe("force-dynamic");
    const url = "http://localhost/api/endvera/v1/mobile/assistant/project-memory?workspaceId=workspace-a&projectId=project-a";
    expect((await GET(new Request(url))).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({ userId: "owner-a", workspaceId: "workspace-a", projectId: "project-a" });
    expect((await GET(new Request(`${url}&snapshotId=client-controlled`))).status).toBe(400);
  });
});
