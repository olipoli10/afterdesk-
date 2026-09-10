import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), membership: vi.fn(), member: vi.fn(), workspace: vi.fn(), project: vi.fn(),
  locate: vi.fn(), source: vi.fn(), read: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/construction-assistant-v1/workspace", () => ({ requireActiveConstructionMember: mocks.membership }));
vi.mock("@/lib/storage-local", () => ({ readLocalObject: mocks.read, deleteLocalObject: vi.fn(), putLocalObject: vi.fn(), scanLocalObjects: vi.fn(), LOCAL_OBJECT_SCAN_MAX_ENTRIES: 256 }));
import { resolveProjectBrainVoiceSource } from "@/server/model-gateway/voice/project-brain-subject";
import { inspectProjectBrainSourceSegments } from "@/server/model-gateway/voice/source-segments";
import { projectBrainSourceBytesForUser } from "@/server/construction-operating-assistant-r36v/project-brain-intake";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const bytes = Buffer.from("independent synthetic bytes, not playable media");
  const stamp = new Date("2026-09-10T15:00:00.000Z");
  const request = { actorUserId: "audit-owner", workspaceId: "audit-workspace", projectId: "audit-project", intakeId: "audit-intake",
    sourceId: "audit-source", expectedIntakeStateVersion: 7 };
  const member = { id: "audit-member", workspaceId: request.workspaceId, userId: request.actorUserId, role: "owner", status: "active", updatedAt: stamp };
  const workspace = { id: request.workspaceId, ownerUserId: request.actorUserId, status: "active", updatedAt: stamp };
  const project = { id: request.projectId, workspaceId: request.workspaceId, status: "active", updatedAt: stamp };
  const source = { id: request.sourceId, workspaceId: request.workspaceId, projectId: request.projectId, intakeId: request.intakeId,
    fileId: "audit-file", kind: "VOICE_NOTE", createdByUserId: request.actorUserId, mimeType: "audio/mp4", sizeBytes: bytes.length,
    contentHash: digest(bytes), durationMs: 60000, transcriptionState: "NOT_REQUESTED_LOCAL_ONLY", documentUnderstandingState: "NOT_REQUESTED_LOCAL_ONLY",
    displayName: "synthetic.m4a", intake: { id: request.intakeId, workspaceId: request.workspaceId, projectId: request.projectId,
      createdByUserId: request.actorUserId, status: "CONFIRMED", stateVersion: 7, updatedAt: stamp },
    file: { id: "audit-file", storageKey: "synthetic-storage-key", fileName: "synthetic.m4a", uploaderId: request.actorUserId,
      sha256: digest(bytes), sizeBytes: bytes.length, detectedMime: "audio/mp4", scanDetails: "LOCAL_SIGNATURE_SANITIZATION; synthetic",
      taskId: null as string | null, submissionId: null as string | null, purgedAt: null as Date | null } };
  return { bytes, request, member, workspace, project, source };
}
let f = fixture();
const tx = { constructionWorkspaceMember: { findUnique: mocks.member }, constructionWorkspace: { findFirst: mocks.workspace },
  constructionProject: { findFirst: mocks.project }, constructionProjectBrainSource: { findUnique: mocks.locate, findFirst: mocks.source },
  fileAccessLog: { create: mocks.audit } };
beforeEach(() => {
  vi.resetAllMocks(); f = fixture();
  mocks.transaction.mockImplementation(async callback => callback(tx));
  mocks.membership.mockImplementation(async () => ({ role: f.member.role, status: f.member.status }));
  mocks.member.mockImplementation(async () => f.member);
  mocks.workspace.mockImplementation(async query => query.where.ownerUserId === f.workspace.ownerUserId && f.workspace.status === "active" ? f.workspace : null);
  mocks.project.mockImplementation(async query => query.where.id === f.project.id && query.where.workspaceId === f.project.workspaceId && f.project.status === "active" ? f.project : null);
  mocks.locate.mockImplementation(async () => ({ workspaceId: f.source.workspaceId, projectId: f.source.projectId }));
  mocks.source.mockImplementation(async query => Object.entries(query.where).every(([key, value]) => f.source[key as keyof typeof f.source] === value) ? f.source : null);
  mocks.read.mockImplementation(async () => f.bytes);
});
async function resolved() {
  const result = await resolveProjectBrainVoiceSource({ ...f.request, enabled: true });
  if (result.status !== "RESOLVED_LOCAL_NOT_AUTHORIZED") throw new Error("AUDIT_UNEXPECTED_DISABLED");
  return result;
}
async function manifestInput() {
  const source = await resolved();
  const first = Buffer.from("synthetic transformed bytes first"), second = Buffer.from("synthetic transformed bytes second");
  return { subject: source.subject, subjectFingerprint: source.subjectFingerprint, sourceBytes: source.bytes,
    transformer: { id: "audit-synthetic", version: "1", encodingProfile: "not-a-real-decoder", mode: "SYNTHETIC_LOCAL" as const },
    segments: [{ ordinal: 0, startMs: 0, endMs: 45000, durationMs: 45000, mediaFormat: "m4a", mimeType: "audio/mp4", contentHash: digest(first), bytes: first },
      { ordinal: 1, startMs: 45000, endMs: 60000, durationMs: 15000, mediaFormat: "m4a", mimeType: "audio/mp4", contentHash: digest(second), bytes: second }] };
}

describe("independent Project Brain voice source review — real helpers with synthetic DB/storage", () => {
  it("does not inspect storage, authorize, or manufacture a client/session by default", async () => {
    expect(await resolveProjectBrainVoiceSource(f.request)).toEqual({ status: "DISABLED", executionAuthorized: false });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rechecks authority around the real internal reader without falsely recording a download", async () => {
    const result = await resolved();
    expect(mocks.transaction).toHaveBeenCalledTimes(4);
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith("synthetic-storage-key");
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(result.subjectFingerprint).toBe(sha256Canonical(result.subject));
    expect(Object.isFrozen(result.subject)).toBe(true);
    expect(result.bytes).not.toBe(f.bytes);
    expect(result).toMatchObject({ executionAuthorized: false, externalTransportPerformed: false });
    for (const key of ["clientId", "tenantId", "sessionId", "taskId", "operationId", "grantId"]) expect(result.subject).not.toHaveProperty(key);
  });
  it("preserves the public reader's one download audit", async () => {
    const result = await projectBrainSourceBytesForUser({ userId: f.request.actorUserId, sourceId: f.request.sourceId });
    expect(result.bytes).toEqual(f.bytes);
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({ data: { fileId: "audit-file", userId: "audit-owner", action: "download" } });
  });
  it.each(["member", "workspace", "project", "intake"] as const)("rejects changed %s revision after storage latency", async key => {
    mocks.read.mockImplementation(async () => {
      const target = key === "intake" ? f.source.intake : f[key]; target.updatedAt = new Date("2026-09-10T15:00:01.000Z"); return f.bytes;
    });
    await expect(resolved()).rejects.toThrow("PROJECT_BRAIN_VOICE_AUTHORITY_CHANGED");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each(["owner", "file", "intakeVersion", "purge", "submission"] as const)("rejects %s mutation during storage latency", async key => {
    mocks.read.mockImplementation(async () => {
      if (key === "owner") f.workspace.ownerUserId = "other";
      if (key === "file") { f.source.fileId = "other-file"; f.source.file.id = "other-file"; }
      if (key === "intakeVersion") f.source.intake.stateVersion++;
      if (key === "purge") f.source.file.purgedAt = new Date();
      if (key === "submission") f.source.file.submissionId = "foreign-submission";
      return f.bytes;
    });
    await expect(resolved()).rejects.toThrow(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects changed content metadata even when the returned buffer itself still matches the initial hash", async () => {
    mocks.read.mockImplementation(async () => { f.source.contentHash = "f".repeat(64); f.source.file.sha256 = f.source.contentHash; return f.bytes; });
    await expect(resolved()).rejects.toThrow();
  });
  it("re-hashes resolver output before accepting a downstream manifest", async () => {
    const input = await manifestInput(); input.sourceBytes[0] ^= 255;
    expect(() => inspectProjectBrainSourceSegments(input, { enabled: true })).toThrow("SOURCE_CHANGED");
  });
  it("returns an immutable metadata-only manifest while making the absence of decoding proof explicit", async () => {
    const input = await manifestInput(), result = inspectProjectBrainSourceSegments(input, { enabled: true });
    if (result.status !== "MANIFEST_VALIDATED_LOCAL_NOT_AUTHORIZED") throw new Error("AUDIT_UNEXPECTED_DISABLED");
    const oldHash = result.manifestHash;
    input.transformer.version = "changed-after-validation"; input.segments[0].bytes.fill(0); input.segments[0].contentHash = "f".repeat(64);
    expect(result).toMatchObject({ executionAuthorized: false, externalTransportPerformed: false, manifest: { mediaDecodingVerified: false } });
    expect(Object.isFrozen(result.manifest)).toBe(true); expect(Object.isFrozen(result.manifest.subject)).toBe(true);
    expect(Object.isFrozen(result.manifest.transformer)).toBe(true); expect(Object.isFrozen(result.manifest.segments[0])).toBe(true);
    expect(sha256Canonical(result.manifest)).toBe(oldHash);
    expect(result.manifest.segments[0]).not.toHaveProperty("bytes");
  });
  it("does not promote self-consistent synthetic segment hashes into actual media-decoding evidence", async () => {
    const input = await manifestInput();
    const result = inspectProjectBrainSourceSegments(input, { enabled: true });
    expect(result).toMatchObject({ status: "MANIFEST_VALIDATED_LOCAL_NOT_AUTHORIZED", manifest: { mediaDecodingVerified: false,
      transformer: { mode: "SYNTHETIC_LOCAL" } }, executionAuthorized: false });
  });
  it.each(["gap", "overlap", "missingTail", "ordinal", "mime", "hash"] as const)("refuses a %s segment inconsistency", async change => {
    const input = await manifestInput();
    if (change === "gap") input.segments[1].startMs++;
    if (change === "overlap") input.segments[1].startMs--;
    if (change === "missingTail") input.segments.pop();
    if (change === "ordinal") input.segments[1].ordinal = 0;
    if (change === "mime") input.segments[0].mimeType = "application/octet-stream";
    if (change === "hash") input.segments[0].bytes[0] ^= 255;
    expect(() => inspectProjectBrainSourceSegments(input, { enabled: true })).toThrow();
  });
});
