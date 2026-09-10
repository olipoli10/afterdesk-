import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileApi } from "../src/lib/api";

const command = { schemaVersion: 1, commandId: "b3e8a52c-5ce1-4e8d-a99b-e9660c9fceac", action: "ADMIT_PROJECT_BRAIN_SOURCE",
  workspaceId: "workspace", projectId: "project", intakeId: "intake", expectedStateVersion: 1,
  kind: "VOICE_NOTE", fileName: "memo.m4a", mimeType: "audio/m4a", sizeBytes: 4800000, durationMs: 600000, uri: "file:///document/memo.m4a" };
afterEach(() => vi.useRealTimers());
describe("bounded long-dictation upload, no actual transport", () => {
  it("credential lookup failure clears the pending deadline without starting transport", async () => {
    vi.useFakeTimers(); const fetchImpl = vi.fn();
    const api = new MobileApi({ baseUrl: "https://synthetic.invalid", getCookie: () => { throw new Error("synthetic cookie read failed"); }, fetchImpl });
    await expect(api.uploadProjectBrainSource(command)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(vi.getTimerCount()).toBe(0); await vi.advanceTimersByTimeAsync(120000); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("returns unknown at120s even when injected fetch ignores its abort, never retries", async () => {
    vi.useFakeTimers(); let signal: AbortSignal | null = null;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => { signal = init?.signal ?? null; return new Promise<Response>(() => undefined); });
    const api = new MobileApi({ baseUrl: "https://synthetic.invalid", getCookie: () => "", fetchImpl });
    const result = api.uploadProjectBrainSource(command).catch(error => error);
    await vi.advanceTimersByTimeAsync(119999); expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(await result).toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(signal!.aborted).toBe(true); expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("bounds JSON body reading as well as receiving headers", async () => {
    vi.useFakeTimers();
    const api = new MobileApi({ baseUrl: "https://synthetic.invalid", getCookie: () => "", fetchImpl: async () => ({ ok: true, status: 200,
      json: () => new Promise(() => undefined) }) as unknown as Response });
    const result = api.uploadProjectBrainSource(command).catch(error => error);
    await vi.advanceTimersByTimeAsync(120000); expect(await result).toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
