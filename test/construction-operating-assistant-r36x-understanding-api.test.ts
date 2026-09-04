import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(), consumeRateLimit: vi.fn(), command: vi.fn(), read: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({ getSessionUser: mocks.getSessionUser, consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/server/construction-operating-assistant-r36x/project-brain-understanding-review", () => ({
  applyProjectBrainUnderstandingCommandForUser: mocks.command,
  projectBrainUnderstandingForUser: mocks.read,
}));

import { GET, POST, dynamic, runtime } from "@/app/api/endvera/v1/mobile/project-brain-understanding-review/route";

const create = {
  schemaVersion: 1, action: "CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW",
  commandId: "127600fe-d3a1-4a29-928e-4810d8635e72", workspaceId: "workspace-a", projectId: "project-a",
};
const request = (body: unknown) => new Request("http://localhost/api/endvera/v1/mobile/project-brain-understanding-review", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("R36X understanding API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "owner-a", role: "CLIENT", emailVerified: true });
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.command.mockResolvedValue({ replayed: false });
    mocks.read.mockResolvedValue({ schemaVersion: 1, review: null });
  });

  it("is private, dynamic and strict", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    mocks.getSessionUser.mockResolvedValueOnce(null);
    const anonymous = await POST(request(create));
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("private, no-store");
    expect((await POST(request({ ...create, automaticResolution: true }))).status).toBe(400);
  });

  it("resolves current review from project navigation only", async () => {
    const url = "http://localhost/api/endvera/v1/mobile/project-brain-understanding-review?workspaceId=workspace-a&projectId=project-a";
    expect((await GET(new Request(url))).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({ userId: "owner-a", workspaceId: "workspace-a", projectId: "project-a" });
    expect((await GET(new Request(`${url}&reviewId=client-controlled`))).status).toBe(400);
  });

  it("maps non-enumerating, conflict, incomplete and corrupt outcomes", async () => {
    mocks.command.mockRejectedValueOnce(new Error("CONSTRUCTION_RESOURCE_NOT_FOUND"));
    expect((await POST(request(create))).status).toBe(404);
    mocks.command.mockRejectedValueOnce(new Error("PROJECT_BRAIN_UNDERSTANDING_CONFLICT"));
    expect((await POST(request(create))).status).toBe(409);
    mocks.command.mockRejectedValueOnce(new Error("PROJECT_BRAIN_UNDERSTANDING_INCOMPLETE"));
    expect((await POST(request(create))).status).toBe(422);
    mocks.command.mockRejectedValueOnce(new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT"));
    expect((await POST(request(create))).status).toBe(422);
  });
});
