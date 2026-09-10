import { describe, expect, it, vi } from "vitest";
import { schedulePersonalSmsWakeup } from "@/server/personal-assistant/sms-wakeup";

function fixture() {
  const callbacks: Array<() => Promise<void>> = [];
  const run = vi.fn().mockResolvedValue(undefined);
  const deps = { enabled: true, deadlineAt: 55_000, now: () => 0,
    schedule: vi.fn((callback: () => Promise<void>) => { callbacks.push(callback); }), run };
  return { deps, callbacks, run };
}
describe("durable SMS best-effort wakeup", () => {
  it("schedules without waiting for or claiming completed work", async () => {
    const { deps, callbacks, run } = fixture();
    expect(schedulePersonalSmsWakeup({ replayed: false }, deps)).toBe("SCHEDULED");
    expect(run).not.toHaveBeenCalled();
    await callbacks[0]();
    expect(run).toHaveBeenCalledExactlyOnceWith(55_000);
  });
  it("does not schedule replayed receipts", () => {
    const { deps } = fixture();
    expect(schedulePersonalSmsWakeup({ replayed: true }, deps)).toBe("REPLAY");
    expect(deps.schedule).not.toHaveBeenCalled();
  });
  it("does not schedule when worker is disabled", () => {
    const { deps } = fixture(); deps.enabled = false;
    expect(schedulePersonalSmsWakeup({ replayed: false }, deps)).toBe("DISABLED");
    expect(deps.schedule).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity])("refuses invalid or exhausted deadline %s", deadlineAt => {
    const { deps } = fixture();
    expect(schedulePersonalSmsWakeup({ replayed: false }, { ...deps, deadlineAt })).toBe("DEADLINE_EXPIRED");
    expect(deps.schedule).not.toHaveBeenCalled();
  });
  it("retains the original request deadline when callback starts late", async () => {
    const { deps, callbacks, run } = fixture();
    schedulePersonalSmsWakeup({ replayed: false }, deps);
    deps.now = () => 55_001;
    await callbacks[0](); expect(run).not.toHaveBeenCalled();
  });
  it("does not throw after durable receipt when the scheduler fails", () => {
    const { deps, run } = fixture();
    deps.schedule.mockImplementation(() => { throw new Error("private scheduler detail"); });
    expect(schedulePersonalSmsWakeup({ replayed: false }, deps)).toBe("SCHEDULER_UNAVAILABLE");
    expect(run).not.toHaveBeenCalled();
  });
  it("runs once even if the callback is invoked twice concurrently", async () => {
    const { deps, callbacks, run } = fixture();
    schedulePersonalSmsWakeup({ replayed: false }, deps);
    await Promise.all([callbacks[0](), callbacks[0]()]);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("does not retry or propagate worker failure", async () => {
    const { deps, callbacks, run } = fixture(); run.mockRejectedValue(new Error("private detail"));
    schedulePersonalSmsWakeup({ replayed: false }, deps);
    await expect(callbacks[0]()).resolves.toBeUndefined();
    await callbacks[0](); expect(run).toHaveBeenCalledTimes(1);
  });
});
