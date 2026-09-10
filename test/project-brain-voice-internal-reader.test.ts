import { beforeEach, describe, expect, it, vi } from "vitest";
import { voiceFixture } from "./fixtures/project-brain-voice";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), member: vi.fn(), project: vi.fn(), locate: vi.fn(), source: vi.fn(), read: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/construction-assistant-v1/workspace", () => ({ requireActiveConstructionMember: mocks.member }));
vi.mock("@/lib/storage-local", () => ({ readLocalObject: mocks.read, deleteLocalObject: vi.fn(), putLocalObject: vi.fn(), scanLocalObjects: vi.fn(), LOCAL_OBJECT_SCAN_MAX_ENTRIES: 256 }));
import { projectBrainSourceBytesForUser, readProjectBrainSourceBytesInternally } from "@/server/construction-operating-assistant-r36v/project-brain-intake";
const tx = { constructionProject: { findFirst: mocks.project }, constructionProjectBrainSource: { findUnique: mocks.locate, findFirst: mocks.source }, fileAccessLog: { create: mocks.audit } };
beforeEach(() => {
  vi.resetAllMocks(); const fixture = voiceFixture();
  mocks.transaction.mockImplementation(async callback => callback(tx)); mocks.member.mockResolvedValue({ role: "owner", status: "active" });
  mocks.project.mockResolvedValue(fixture.project); mocks.locate.mockResolvedValue(fixture.source); mocks.source.mockResolvedValue(fixture.source); mocks.read.mockResolvedValue(fixture.bytes);
});
describe("R36V existing public read versus internal local read", () => {
  it.each([projectBrainSourceBytesForUser, readProjectBrainSourceBytesInternally])("keeps the same bytes and both authorizations", async reader => {
    const result = await reader({ userId: "owner-a", sourceId: "source-a" });
    expect(result.bytes).toEqual(voiceFixture().bytes); expect(mocks.member).toHaveBeenCalledTimes(2); expect(mocks.project).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenCalledTimes(reader === projectBrainSourceBytesForUser ? 1 : 0);
    if (reader === projectBrainSourceBytesForUser) expect(mocks.audit).toHaveBeenCalledWith({ data: { fileId: "file-a", userId: "owner-a", action: "download" } });
  });
  it.each([projectBrainSourceBytesForUser, readProjectBrainSourceBytesInternally])("rejects project revocation during read without download audit", async reader => {
    mocks.read.mockImplementation(async () => { mocks.project.mockResolvedValue(null); return voiceFixture().bytes; });
    await expect(reader({ userId: "owner-a", sourceId: "source-a" })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND"); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each([projectBrainSourceBytesForUser, readProjectBrainSourceBytesInternally])("rejects corrupted local bytes before audit", async reader => {
    mocks.read.mockResolvedValue(Buffer.from("wrong"));
    await expect(reader({ userId: "owner-a", sourceId: "source-a" })).rejects.toThrow("PROJECT_BRAIN_SOURCE_BYTES_CORRUPT"); expect(mocks.audit).not.toHaveBeenCalled();
  });
});
