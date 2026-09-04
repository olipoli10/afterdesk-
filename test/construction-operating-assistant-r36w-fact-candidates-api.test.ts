import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  consumeRateLimit: vi.fn(),
  generate: vi.fn(),
  read: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({
  getSessionUser: mocks.getSessionUser,
  consumeRateLimit: mocks.consumeRateLimit,
}));
vi.mock("@/server/construction-operating-assistant-r36w/project-brain-fact-candidates", () => ({
  generateProjectBrainFactCandidatesForUser: mocks.generate,
  projectBrainFactCandidatesForUser: mocks.read,
}));

import { GET, POST, dynamic, runtime } from "@/app/api/endvera/v1/mobile/project-brain-fact-candidates/route";

const command = {
  schemaVersion: 1,
  action: "GENERATE_PROJECT_BRAIN_FACT_CANDIDATES",
  commandId: "cf8e02be-70d7-47e6-89ad-b8e78266db64",
  workspaceId: "workspace-a",
  projectId: "project-a",
  intakeId: "intake-a",
  confirmedSnapshotHash: "a".repeat(64),
  adapterSetVersion: "PROJECT_BRAIN_FACT_CANDIDATES_V1",
} as const;

function request(body: unknown) {
  return new Request("http://localhost/api/endvera/v1/mobile/project-brain-fact-candidates", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("R36W fact candidate API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "owner-a", role: "CLIENT", emailVerified: true });
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.generate.mockResolvedValue({ commandId: command.commandId, replayed: false });
    mocks.read.mockResolvedValue({ schemaVersion: 1, batch: null });
  });

  it("is private dynamic Node and rejects anonymous or malformed commands", async () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    mocks.getSessionUser.mockResolvedValueOnce(null);
    const anonymous = await POST(request(command));
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("private, no-store");
    expect((await POST(request({ ...command, provider: "forbidden" }))).status).toBe(400);
  });

  it("accepts one strict body-bound command and maps conflict/corruption", async () => {
    expect((await POST(request(command))).status).toBe(201);
    expect(mocks.generate).toHaveBeenCalledWith({ userId: "owner-a", command });
    mocks.generate.mockRejectedValueOnce(new Error("PROJECT_BRAIN_FACT_CANDIDATE_CONFLICT"));
    expect((await POST(request(command))).status).toBe(409);
    mocks.generate.mockRejectedValueOnce(new Error("PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT"));
    expect((await POST(request(command))).status).toBe(422);
  });

  it("reads only the exact scoped projection and rejects query drift", async () => {
    const url = "http://localhost/api/endvera/v1/mobile/project-brain-fact-candidates?workspaceId=workspace-a&projectId=project-a&intakeId=intake-a";
    expect((await GET(new Request(url))).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({ userId: "owner-a", workspaceId: "workspace-a", projectId: "project-a", intakeId: "intake-a" });
    expect((await GET(new Request(`${url}&actorId=other`))).status).toBe(400);
  });
});
