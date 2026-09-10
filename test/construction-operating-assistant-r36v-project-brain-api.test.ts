import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  consumeRateLimit: vi.fn(),
  processCommand: vi.fn(),
  projectionForUser: vi.fn(),
  admitSource: vi.fn(),
  readSource: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({
  getSessionUser: mocks.getSessionUser,
  consumeRateLimit: mocks.consumeRateLimit,
}));

vi.mock("@/lib/file-security", () => ({
  FileRejectedError: class FileRejectedError extends Error {},
  ScannerUnavailableError: class ScannerUnavailableError extends Error {},
}));

vi.mock("@/server/construction-operating-assistant-r36v/project-brain-intake", () => ({
  admitProjectBrainSource: mocks.admitSource,
  processProjectBrainIntakeCommand: mocks.processCommand,
  projectBrainIntakeProjectionForUser: mocks.projectionForUser,
  projectBrainSourceBytesForUser: mocks.readSource,
}));

import {
  dynamic as commandDynamic,
  GET,
  POST,
  runtime as commandRuntime,
} from "@/app/api/endvera/v1/mobile/project-brain-intake/route";
import {
  dynamic as sourceDynamic,
  POST as POST_SOURCE,
  runtime as sourceRuntime,
} from "@/app/api/endvera/v1/mobile/project-brain-intake/sources/route";
import {
  dynamic as sourceReadDynamic,
  GET as GET_SOURCE,
  runtime as sourceReadRuntime,
} from "@/app/api/endvera/v1/mobile/project-brain-intake/sources/[sourceId]/route";
import { LocalObjectStorageError } from "@/lib/storage-local";

const user = { id: "user-a", role: "CLIENT", emailVerified: true };
const createCommand = {
  schemaVersion: 1,
  action: "CREATE_PROJECT_BRAIN_INTAKE",
  commandId: "cf8e02be-70d7-47e6-89ad-b8e78266db64",
  workspaceId: "workspace-a",
  projectId: "project-a",
} as const;
const commandResult = {
  ...createCommand,
  intakeId: "intake-a",
  stateVersion: 1,
  status: "DRAFT",
  reviewFingerprint: null,
  canonicalEffectId: "effect-a",
  replayed: false,
  providerExecutionPerformed: false,
  externalTransportPerformed: false,
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/endvera/v1/mobile/project-brain-intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sourceRequest(
  overrides: Record<string, unknown> = {},
  fileType = "application/pdf",
  contents: BlobPart[] = [new TextEncoder().encode("%PDF-local-only")],
) {
  const file = new File(contents, "scope.pdf", { type: fileType });
  const command = {
    schemaVersion: 1,
    action: "ADMIT_PROJECT_BRAIN_SOURCE",
    commandId: "4e8b78e6-2cfa-4df1-869c-31048f432b0a",
    workspaceId: "workspace-a",
    projectId: "project-a",
    intakeId: "intake-a",
    expectedStateVersion: 1,
    kind: "DOCUMENT",
    fileName: "scope.pdf",
    mimeType: "application/pdf",
    sizeBytes: file.size,
    durationMs: null,
    ...overrides,
  };
  const form = new FormData();
  form.append("command", JSON.stringify(command));
  form.append("file", file);
  return new Request("http://localhost/api/endvera/v1/mobile/project-brain-intake/sources", {
    method: "POST",
    body: form,
  });
}

describe("R36V Project Brain mobile API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue(user);
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.processCommand.mockResolvedValue(commandResult);
    mocks.projectionForUser.mockResolvedValue({
      schemaVersion: 1,
      intake: null,
      limitations: [],
      providerExecutionPerformed: false,
      externalTransportPerformed: false,
    });
    mocks.admitSource.mockResolvedValue({
      ...commandResult,
      action: "ADMIT_PROJECT_BRAIN_SOURCE",
      stateVersion: 2,
    });
    mocks.readSource.mockResolvedValue({
      bytes: Buffer.from("local-source", "utf8"),
      fileName: "scope.pdf",
      mimeType: "application/pdf",
      contentHash: "a".repeat(64),
    });
  });

  it("forces private dynamic Node responses and rejects anonymous access", async () => {
    expect([commandRuntime, sourceRuntime, sourceReadRuntime]).toEqual([
      "nodejs",
      "nodejs",
      "nodejs",
    ]);
    expect([commandDynamic, sourceDynamic, sourceReadDynamic]).toEqual([
      "force-dynamic",
      "force-dynamic",
      "force-dynamic",
    ]);
    mocks.getSessionUser.mockResolvedValueOnce(null);
    const response = await POST(jsonRequest(createCommand));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.processCommand).not.toHaveBeenCalled();
  });

  it("conceals routes from non-CLIENT and unverified users", async () => {
    mocks.getSessionUser.mockResolvedValueOnce({ ...user, role: "ADMIN" });
    expect((await POST(jsonRequest(createCommand))).status).toBe(404);
    mocks.getSessionUser.mockResolvedValueOnce({ ...user, emailVerified: false });
    expect((await POST_SOURCE(sourceRequest())).status).toBe(404);
  });

  it("serves only an exact scoped projection and enforces its rate limit", async () => {
    const response = await GET(new Request(
      "http://localhost/api/endvera/v1/mobile/project-brain-intake?workspaceId=workspace-a&projectId=project-a",
    ));
    expect(response.status).toBe(200);
    expect(mocks.projectionForUser).toHaveBeenCalledWith({
      userId: "user-a",
      workspaceId: "workspace-a",
      projectId: "project-a",
    });
    expect((await response.json()).providerExecutionPerformed).toBe(false);

    const extra = await GET(new Request(
      "http://localhost/api/endvera/v1/mobile/project-brain-intake?workspaceId=workspace-a&projectId=project-a&actorId=user-b",
    ));
    expect(extra.status).toBe(400);
    mocks.consumeRateLimit.mockResolvedValueOnce(false);
    expect((await GET(new Request(
      "http://localhost/api/endvera/v1/mobile/project-brain-intake?workspaceId=workspace-a&projectId=project-a",
    ))).status).toBe(429);
  });

  it("accepts strict commands, rejects caller-controlled fields, and maps drift to 409", async () => {
    const created = await POST(jsonRequest(createCommand));
    expect(created.status).toBe(201);
    expect(mocks.processCommand).toHaveBeenCalledWith({ userId: "user-a", command: createCommand });

    const injected = await POST(jsonRequest({ ...createCommand, actorUserId: "user-b" }));
    expect(injected.status).toBe(400);
    mocks.processCommand.mockRejectedValueOnce(new Error("PROJECT_BRAIN_STALE_STATE_VERSION"));
    expect((await POST(jsonRequest(createCommand))).status).toBe(409);
    mocks.processCommand.mockRejectedValueOnce(new Error("CONSTRUCTION_RESOURCE_NOT_FOUND"));
    expect((await POST(jsonRequest(createCommand))).status).toBe(404);
    mocks.processCommand.mockRejectedValueOnce(new Error("PROJECT_BRAIN_RESULT_CORRUPT"));
    expect((await POST(jsonRequest(createCommand))).status).toBe(500);
  });

  it("stops an oversized JSON stream even when content length is omitted", async () => {
    const response = await POST(new Request(
      "http://localhost/api/endvera/v1/mobile/project-brain-intake",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(70 * 1024) }),
      },
    ));
    expect(response.status).toBe(413);
    expect(mocks.processCommand).not.toHaveBeenCalled();

    const invalidLength = await POST(new Request(
      "http://localhost/api/endvera/v1/mobile/project-brain-intake",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "unknown",
        },
        body: "{}",
      },
    ));
    expect(invalidLength.status).toBe(400);
  });

  it("admits one exact multipart source and rejects metadata drift", async () => {
    const admitted = await POST_SOURCE(sourceRequest());
    expect(admitted.status).toBe(201);
    expect(mocks.admitSource).toHaveBeenCalledOnce();
    expect(mocks.admitSource.mock.calls[0][0]).toMatchObject({
      userId: "user-a",
      command: { action: "ADMIT_PROJECT_BRAIN_SOURCE", mimeType: "application/pdf" },
    });
    expect(Buffer.isBuffer(mocks.admitSource.mock.calls[0][0].bytes)).toBe(true);

    expect((await POST_SOURCE(sourceRequest({ sizeBytes: 1 }))).status).toBe(422);
    expect((await POST_SOURCE(sourceRequest({ mimeType: "image/png", kind: "PHOTO" }))).status).toBe(422);
    expect((await POST_SOURCE(sourceRequest({}, "application/pdf", []))).status).toBe(413);
  });

  it("rejects unknown and duplicate multipart fields before admission", async () => {
    const request = sourceRequest();
    const form = await request.formData();
    form.append("command", JSON.stringify(createCommand));
    form.append("provider", "forbidden");
    const response = await POST_SOURCE(new Request(request.url, {
      method: "POST",
      headers: { "content-length": "4096" },
      body: form,
    }));
    expect(response.status).toBe(400);
    expect(mocks.admitSource).not.toHaveBeenCalled();
  });

  it("accepts native multipart without content length and rejects an invalid declaration", async () => {
    const missing = await POST_SOURCE(new Request(
      "http://localhost/api/endvera/v1/mobile/project-brain-intake/sources",
      {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=missing" },
        body: "--missing--",
      },
    ));
    expect(missing.status).toBe(400);

    const invalid = await POST_SOURCE(new Request(
      "http://localhost/api/endvera/v1/mobile/project-brain-intake/sources",
      {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=invalid",
          "content-length": "not-a-number",
        },
        body: "--invalid--",
      },
    ));
    expect(invalid.status).toBe(400);
    expect(mocks.admitSource).not.toHaveBeenCalled();
  });

  it("bounds a chunked multipart body even when content length is absent", async () => {
    const response = await POST_SOURCE(new Request(
      "http://localhost/api/endvera/v1/mobile/project-brain-intake/sources",
      {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=chunked" },
        body: new Uint8Array(10 * 1024 * 1024 + 128 * 1024 + 1),
      },
    ));
    expect(response.status).toBe(413);
    expect(mocks.admitSource).not.toHaveBeenCalled();
  });

  it("rejects an oversized multipart envelope before parsing or admission", async () => {
    const response = await POST_SOURCE(new Request(
      "http://localhost/api/endvera/v1/mobile/project-brain-intake/sources",
      {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=oversized",
          "content-length": String(11 * 1024 * 1024),
        },
        body: "--oversized--",
      },
    ));

    expect(response.status).toBe(413);
    expect(mocks.admitSource).not.toHaveBeenCalled();
  });

  it("cancels a stalled multipart reader at the 60-second original-request deadline without admission", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn(), stream = new ReadableStream<Uint8Array>({ pull() { /* Deliberately stalled synthetic upload. */ }, cancel });
      const response = POST_SOURCE(new Request("http://localhost/api/endvera/v1/mobile/project-brain-intake/sources", {
        method: "POST", headers: { "content-type": "multipart/form-data; boundary=stall" }, body: stream, duplex: "half",
      } as RequestInit & { duplex: "half" }));
      await vi.advanceTimersByTimeAsync(60001);
      expect((await response).status).toBe(408); expect(cancel).toHaveBeenCalledTimes(1); expect(mocks.admitSource).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("honors an aborted multipart upload and releases its admission slot", async () => {
    const controller = new AbortController(), cancel = vi.fn();
    const response = POST_SOURCE(new Request("http://localhost/api/endvera/v1/mobile/project-brain-intake/sources", {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=abort" }, signal: controller.signal,
      body: new ReadableStream<Uint8Array>({ pull() { /* Synthetic pending read. */ }, cancel }), duplex: "half",
    } as RequestInit & { duplex: "half" }));
    await vi.waitFor(() => expect(mocks.consumeRateLimit).toHaveBeenCalled());
    controller.abort(); expect((await response).status).toBe(408); expect(mocks.admitSource).not.toHaveBeenCalled();
    expect((await POST_SOURCE(sourceRequest())).status).toBe(201);
  });

  it("bounds concurrent multipart memory before consuming a third source body", async () => {
    const sourceResult = {
      ...commandResult,
      action: "ADMIT_PROJECT_BRAIN_SOURCE" as const,
      stateVersion: 2,
    };
    let releaseAdmissions: ((value: typeof sourceResult) => void) | undefined;
    const admissionGate = new Promise<typeof sourceResult>((resolve) => {
      releaseAdmissions = resolve;
    });
    mocks.admitSource.mockImplementation(() => admissionGate);

    const first = POST_SOURCE(sourceRequest({
      commandId: "4e8b78e6-2cfa-4df1-869c-31048f432b01",
    }));
    const second = POST_SOURCE(sourceRequest({
      commandId: "4e8b78e6-2cfa-4df1-869c-31048f432b02",
    }));
    await vi.waitFor(() => expect(mocks.admitSource).toHaveBeenCalledTimes(2));

    const refusedBodyActivity = { pulls: 0, cancels: 0 };
    const refusedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        refusedBodyActivity.pulls += 1;
        controller.enqueue(new TextEncoder().encode("--not-consumed--"));
        controller.close();
      },
      cancel() {
        refusedBodyActivity.cancels += 1;
      },
    }, { highWaterMark: 0 });
    const refusedBodyReader = vi.spyOn(refusedBody, "getReader");
    const refused = await POST_SOURCE(new Request(
      "http://localhost/api/endvera/v1/mobile/project-brain-intake/sources",
      {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=not-consumed" },
        body: refusedBody,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    ));
    expect(refused.status).toBe(429);
    expect(mocks.admitSource).toHaveBeenCalledTimes(2);
    expect(refusedBodyReader).not.toHaveBeenCalled();
    expect(refusedBodyActivity).toEqual({ pulls: 0, cancels: 0 });

    releaseAdmissions?.(sourceResult);
    const completed = await Promise.all([first, second]);
    expect(completed.map((response) => response.status)).toEqual([201, 201]);

    let rejectAfterSuccess: ((reason?: unknown) => void) | undefined;
    const failureGate = new Promise<typeof sourceResult>((_resolve, reject) => {
      rejectAfterSuccess = reject;
    });
    mocks.admitSource.mockImplementation(() => failureGate);
    const firstFailure = POST_SOURCE(sourceRequest({
      commandId: "4e8b78e6-2cfa-4df1-869c-31048f432b04",
    }));
    const secondFailure = POST_SOURCE(sourceRequest({
      commandId: "4e8b78e6-2cfa-4df1-869c-31048f432b05",
    }));
    await vi.waitFor(() => expect(mocks.admitSource).toHaveBeenCalledTimes(4));
    rejectAfterSuccess?.(new Error("PROJECT_BRAIN_STALE_STATE_VERSION"));
    const failedAfterSuccess = await Promise.all([firstFailure, secondFailure]);
    expect(failedAfterSuccess.map((response) => response.status)).toEqual([409, 409]);

    let releaseAfterFailure: ((value: typeof sourceResult) => void) | undefined;
    const afterFailureGate = new Promise<typeof sourceResult>((resolve) => {
      releaseAfterFailure = resolve;
    });
    mocks.admitSource.mockImplementation(() => afterFailureGate);
    const firstAfterFailure = POST_SOURCE(sourceRequest({
      commandId: "4e8b78e6-2cfa-4df1-869c-31048f432b06",
    }));
    const secondAfterFailure = POST_SOURCE(sourceRequest({
      commandId: "4e8b78e6-2cfa-4df1-869c-31048f432b07",
    }));
    await vi.waitFor(() => expect(mocks.admitSource).toHaveBeenCalledTimes(6));
    releaseAfterFailure?.(sourceResult);
    const completedAfterFailure = await Promise.all([firstAfterFailure, secondAfterFailure]);
    expect(completedAfterFailure.map((response) => response.status)).toEqual([201, 201]);
  });

  it("maps source state conflicts, missing scope, and local storage failures distinctly", async () => {
    mocks.admitSource.mockRejectedValueOnce(
      new Error("PROJECT_BRAIN_VOICE_NOTE_LIMIT_REACHED"),
    );
    expect((await POST_SOURCE(sourceRequest())).status).toBe(409);

    mocks.admitSource.mockRejectedValueOnce(new Error("CONSTRUCTION_RESOURCE_NOT_FOUND"));
    expect((await POST_SOURCE(sourceRequest())).status).toBe(404);

    mocks.admitSource.mockRejectedValueOnce(new LocalObjectStorageError("put"));
    expect((await POST_SOURCE(sourceRequest())).status).toBe(503);

    mocks.admitSource.mockRejectedValueOnce(new Error("PROJECT_BRAIN_RESULT_CORRUPT"));
    expect((await POST_SOURCE(sourceRequest())).status).toBe(500);
  });

  it("retrieves only an authorized immutable local source with private hash-bound headers", async () => {
    const response = await GET_SOURCE(
      new Request("http://localhost/api/endvera/v1/mobile/project-brain-intake/sources/source-a"),
      { params: Promise.resolve({ sourceId: "source-a" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-content-sha256")).toBe("a".repeat(64));
    expect(await response.text()).toBe("local-source");
    expect(mocks.readSource).toHaveBeenCalledWith({
      userId: "user-a",
      sourceId: "source-a",
    });

    mocks.readSource.mockRejectedValueOnce(new Error("CONSTRUCTION_RESOURCE_NOT_FOUND"));
    expect((await GET_SOURCE(
      new Request("http://localhost/api/endvera/v1/mobile/project-brain-intake/sources/foreign"),
      { params: Promise.resolve({ sourceId: "foreign" }) },
    )).status).toBe(404);
    expect((await GET_SOURCE(
      new Request("http://localhost/api/endvera/v1/mobile/project-brain-intake/sources/bad"),
      { params: Promise.resolve({ sourceId: " bad " }) },
    )).status).toBe(404);
  });
});
