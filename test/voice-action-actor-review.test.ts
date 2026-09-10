import { beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), register: vi.fn(), finish: vi.fn(), assemble: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireRole: calls.auth }));
vi.mock("@/server/voice-intake-runtime-boundary", () => ({ getVoiceRuntimeReadiness: vi.fn(), createPortalVoiceSession: calls.create,
  registerPortalVoiceSegment: calls.register, finishPortalVoiceSession: calls.finish, assemblePortalVoiceTranscript: calls.assemble, cancelPortalVoiceSession: calls.cancel }));
import { createVoiceSession, submitVoiceSegment, finishVoiceSession, assembleVoiceTranscript, cancelVoiceSession } from "@/server/actions/voice-intake";

beforeEach(() => { vi.resetAllMocks(); calls.auth.mockResolvedValue({ id: "authenticated-client", role: "CLIENT" }); });
describe("independent Server Action actor binding — runtime mocked, no public exploit", () => {
  it("the real runtime remains OFF and returns no transcript for the synthetic extra actor", async () => {
    const actual = await vi.importActual<typeof import("@/server/voice-intake-runtime-boundary")>("@/server/voice-intake-runtime-boundary");
    expect(actual.getVoiceRuntimeReadiness().operationEnabled).toBe(false);
    await expect(actual.assemblePortalVoiceTranscript({ actor: { id: "different-client", role: "CLIENT" }, sessionId: "victim-session" })).resolves.toEqual({ kind: "disabled" });
  });
  it("does not reach the runtime if authentication refuses", async () => {
    calls.auth.mockRejectedValue(new Error("synthetic-auth-refusal"));
    await expect(assembleVoiceTranscript({ sessionId: "s" })).rejects.toThrow("synthetic-auth-refusal");
    expect(calls.assemble).not.toHaveBeenCalled();
  });
  it("preserves the authenticated actor on a normal input", async () => {
    await assembleVoiceTranscript({ sessionId: "own-session" });
    expect(calls.assemble).toHaveBeenCalledWith({ sessionId: "own-session", actor: { id: "authenticated-client", role: "CLIENT" } });
  });
  it.each([
    ["create", createVoiceSession], ["register", submitVoiceSegment], ["finish", finishVoiceSession],
    ["assemble", assembleVoiceTranscript], ["cancel", cancelVoiceSession],
  ] as const)("%s never allows a serialized extra actor to overwrite the authenticated client", async (name, action) => {
    const untrusted = { sessionId: "victim-session", actor: { id: "different-client", role: "CLIENT" } };
    await action(untrusted as never);
    expect(calls.auth).toHaveBeenCalledWith("CLIENT");
    expect(calls[name].mock.calls[0]?.[0].actor).toEqual({ id: "authenticated-client", role: "CLIENT" });
  });
  it.each([
    ["create", createVoiceSession, { languageHint: "fr", consentVersion: "v1", consentAccepted: true }],
    ["register", submitVoiceSegment, { sessionId: "own-session", ordinal: 0, format: "audio/mp4", mimeType: "audio/mp4", durationMs: 1000, bytes: 2, audio: new Uint8Array([1, 2]).buffer }],
    ["finish", finishVoiceSession, { sessionId: "own-session", expectedSegmentCount: 1 }],
    ["assemble", assembleVoiceTranscript, { sessionId: "own-session" }],
    ["cancel", cancelVoiceSession, { sessionId: "own-session" }],
  ] as const)("%s preserves only its allowed fields and drops privileged extras", async (name, action, allowed) => {
    await action({ ...allowed, actor: { id: "victim", role: "ADMIN" }, now: "2040-01-01", maxTotalCostMicros: "999999999",
      providerAdopted: true, realProviderCertified: true, workspaceId: "victim-workspace", requestedByUserId: "victim" } as never);
    expect(calls[name]).toHaveBeenCalledWith({ ...allowed, actor: { id: "authenticated-client", role: "CLIENT" } });
  });
});
