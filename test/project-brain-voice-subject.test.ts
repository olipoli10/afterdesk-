import { beforeEach, describe, expect, it, vi } from "vitest";
import { voiceFixture } from "./fixtures/project-brain-voice";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), membership: vi.fn(), member: vi.fn(), workspace: vi.fn(), project: vi.fn(), source: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/construction-assistant-v1/workspace", () => ({ requireActiveConstructionMember: mocks.membership }));
vi.mock("@/server/construction-operating-assistant-r36v/project-brain-intake", () => ({ readProjectBrainSourceBytesInternally: mocks.read }));
import { resolveProjectBrainVoiceSource } from "@/server/model-gateway/voice/project-brain-subject";

const tx = { constructionWorkspaceMember: { findUnique: mocks.member }, constructionWorkspace: { findFirst: mocks.workspace },
  constructionProject: { findFirst: mocks.project }, constructionProjectBrainSource: { findFirst: mocks.source } };
let fixture = voiceFixture();
beforeEach(() => {
  vi.resetAllMocks(); fixture = voiceFixture();
  mocks.transaction.mockImplementation(async callback => callback(tx));
  mocks.membership.mockResolvedValue({ role: "owner", status: "active" });
  mocks.member.mockImplementation(async () => fixture.member); mocks.workspace.mockImplementation(async () => fixture.workspace);
  mocks.project.mockImplementation(async () => fixture.project); mocks.source.mockImplementation(async () => fixture.source);
  mocks.read.mockImplementation(async () => ({ bytes: fixture.bytes, contentHash: fixture.source.contentHash, mimeType: fixture.source.mimeType }));
});
const run = () => resolveProjectBrainVoiceSource({ ...fixture.request, enabled: true });
describe("Project Brain voice owner source resolver OFF", () => {
  it("does nothing by default", async () => {
    expect(await resolveProjectBrainVoiceSource(fixture.request)).toEqual({ status: "DISABLED", executionAuthorized: false });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("resolves only local provenance, without manufacturing CLIENT/session/authority", async () => {
    const result = await run();
    expect(result.status).toBe("RESOLVED_LOCAL_NOT_AUTHORIZED");
    if (result.status !== "RESOLVED_LOCAL_NOT_AUTHORIZED") throw new Error("unexpected");
    expect(result.subject).toEqual(fixture.subject); expect(Object.isFrozen(result.subject)).toBe(true);
    expect(result.executionAuthorized).toBe(false); expect(result.externalTransportPerformed).toBe(false);
    expect(result).not.toHaveProperty("sessionId"); expect(result.bytes).not.toBe(fixture.bytes);
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ userId: "owner-a", sourceId: "source-a" });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.source.mock.calls[0][0].where).toEqual({ id: "source-a", workspaceId: "workspace-a", projectId: "project-a", intakeId: "intake-a" });
  });
  it.each(["admin", "CLIENT", "member"])("does not reinterpret %s as owner", async role => {
    mocks.membership.mockResolvedValue({ role }); await expect(run()).rejects.toThrow(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each(["DRAFT", "READY_FOR_REVIEW", "CONFIRMED"])("preserves admissible historical intake state %s", async status => {
    fixture.source.intake.status = status;
    const result = await run();
    expect(result.status).toBe("RESOLVED_LOCAL_NOT_AUTHORIZED");
    if (result.status === "RESOLVED_LOCAL_NOT_AUTHORIZED") expect(result.subject.intakeStatus).toBe(status);
    expect(fixture.source.transcriptionState).toBe("NOT_REQUESTED_LOCAL_ONLY");
  });
  it.each(["workspace", "project", "member", "source"] as const)("missing %s refuses", async key => {
    mocks[key].mockResolvedValue(null); await expect(run()).rejects.toThrow(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([
    ["uploader", () => { fixture.source.file.uploaderId = "other"; }],
    ["source owner", () => { fixture.source.createdByUserId = "other"; }],
    ["intake owner", () => { fixture.source.intake.createdByUserId = "other"; }],
    ["cross intake", () => { fixture.source.intake.id = "other"; }],
    ["cross workspace", () => { fixture.source.intake.workspaceId = "other"; }],
    ["stale version", () => { fixture.source.intake.stateVersion++; }],
    ["rejected", () => { fixture.source.intake.status = "REJECTED"; }],
    ["not voice", () => { fixture.source.kind = "PHOTO"; }],
    ["file hash", () => { fixture.source.file.sha256 = "0".repeat(64); }],
    ["file mime", () => { fixture.source.file.detectedMime = "image/png"; }],
    ["file size", () => { fixture.source.file.sizeBytes++; }],
    ["purged", () => { fixture.source.file.purgedAt = new Date(); }],
    ["fake task", () => { fixture.source.file.taskId = "task-a"; }],
    ["duration", () => { fixture.source.durationMs = 600_001; }],
    ["interpretation", () => { fixture.source.transcriptionState = "TRANSCRIBED"; }],
  ] as const)("rejects %s before reading bytes", async (_name, mutate) => {
    mutate(); await expect(run()).rejects.toThrow(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects corrupt bytes even if the reader returns a matching claim", async () => {
    mocks.read.mockResolvedValue({ bytes: Buffer.alloc(fixture.bytes.length), contentHash: fixture.source.contentHash, mimeType: fixture.source.mimeType });
    await expect(run()).rejects.toThrow("PROJECT_BRAIN_VOICE_BYTES_CHANGED");
  });
  it.each(["member", "workspace", "project"] as const)("rejects changed %s epoch during the read", async key => {
    mocks.read.mockImplementation(async () => { fixture[key].updatedAt = new Date("2026-09-10T12:01:00.000Z");
      return { bytes: fixture.bytes, contentHash: fixture.source.contentHash, mimeType: fixture.source.mimeType }; });
    await expect(run()).rejects.toThrow("PROJECT_BRAIN_VOICE_AUTHORITY_CHANGED");
  });
  it("rejects revoked owner during the read", async () => {
    mocks.read.mockImplementation(async () => { fixture.member.status = "revoked";
      return { bytes: fixture.bytes, contentHash: fixture.source.contentHash, mimeType: fixture.source.mimeType }; });
    await expect(run()).rejects.toThrow();
  });
  it("does not accept caller-provided authoritative fields", async () => {
    await expect(resolveProjectBrainVoiceSource({ ...fixture.request, enabled: true, sourceContentHash: fixture.source.contentHash } as never)).rejects.toThrow();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
