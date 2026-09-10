import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ drain: vi.fn(), recover: vi.fn() }));
vi.mock("@/server/personal-assistant/sms-worker", () => ({ drainPersonalSms: mock.drain }));
vi.mock("@/server/personal-assistant/claim-recovery", () => ({ recoverExpiredPersonalActionClaims: mock.recover }));
import { GET } from "@/app/api/endvera/v1/personal/worker/tick/route";

const secret = "synthetic-worker-test-only-".repeat(2);
const request = (authorization?: string) => new Request("http://127.0.0.1/api/endvera/v1/personal/worker/tick", {
  headers: authorization ? { authorization } : {},
});

describe("personal worker authenticated tick", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", secret); vi.stubEnv("ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED", "");
    mock.drain.mockReset(); mock.recover.mockReset();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it.each([undefined, "Bearer wrong", "Basic ignored"])("refuses invalid authentication before worker access (%s)", async header => {
    vi.stubEnv("ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED", "true");
    const result = await GET(request(header));
    expect(result.status).toBe(401);
    expect(mock.drain).not.toHaveBeenCalled();
    expect(mock.recover).not.toHaveBeenCalled();
    expect(result.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses absent or too-short configured secret", async () => {
    vi.stubEnv("CRON_SECRET", "short");
    expect((await GET(request("Bearer short"))).status).toBe(401);
    expect(mock.drain).not.toHaveBeenCalled();
  });

  it("pins one original request deadline and one item", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    mock.drain.mockResolvedValue({ status: "DISABLED", processed: 0 });
    const result = await GET(request(`Bearer ${secret}`));
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(mock.drain).toHaveBeenCalledTimes(1);
    expect(mock.drain.mock.calls[0][0] === process.env).toBe(true);
    expect(mock.drain.mock.calls[0].slice(1)).toEqual([1, { deadlineAt: 1_800_000_055_000 }]);
  });

  it("contains a worker failure without retry or exception disclosure", async () => {
    mock.drain.mockRejectedValue(new Error("synthetic-private-detail-do-not-return"));
    const result = await GET(request(`Bearer ${secret}`));
    expect(result.status).toBe(503);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ error: "WORKER_UNAVAILABLE" });
    expect(mock.drain).toHaveBeenCalledTimes(1);
  });

  it.each(["", "false", "TRUE", "1"])("keeps recovery OFF unless explicitly enabled (%s)", async flag => {
    vi.stubEnv("ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED", flag);
    mock.drain.mockResolvedValue({ disabled: true, processed: 0 });
    const result = await GET(request(`Bearer ${secret}`));
    expect(await result.json()).toEqual({ disabled: true, processed: 0 });
    expect(mock.recover).not.toHaveBeenCalled();
  });

  it("recovers before a disabled worker without extending the request deadline", async () => {
    vi.stubEnv("ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED", "true");
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const recovery = { status: "EXPIRED_ACTION_CLAIMS_RECORDED_UNCERTAIN", recovered: 2, executionAuthorized: false };
    mock.recover.mockImplementation(async () => { now.mockReturnValue(1_800_000_002_000); return recovery; });
    mock.drain.mockResolvedValue({ disabled: true, processed: 0 });
    const result = await GET(request(`Bearer ${secret}`));
    expect(mock.recover).toHaveBeenCalledExactlyOnceWith({ enabled: true, batchSize: 25, deadlineAt: 1_800_000_055_000 });
    expect(mock.drain.mock.calls[0].slice(1)).toEqual([1, { deadlineAt: 1_800_000_055_000 }]);
    expect(await result.json()).toEqual({ disabled: true, processed: 0, actionRecovery: recovery });
  });

  it("does not start a worker if recovery used up the original deadline", async () => {
    vi.stubEnv("ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED", "true");
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    mock.recover.mockImplementation(async () => { now.mockReturnValue(56_000); return { recovered: 0 }; });
    const result = await GET(request(`Bearer ${secret}`));
    expect(result.status).toBe(503); expect(mock.drain).not.toHaveBeenCalled();
  });

  it("does not retry recovery or acknowledge recovery on failure", async () => {
    vi.stubEnv("ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED", "true");
    mock.recover.mockRejectedValue(new Error("synthetic private recovery detail"));
    const result = await GET(request(`Bearer ${secret}`));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: "WORKER_UNAVAILABLE" });
    expect(mock.recover).toHaveBeenCalledTimes(1); expect(mock.drain).not.toHaveBeenCalled();
  });
});
