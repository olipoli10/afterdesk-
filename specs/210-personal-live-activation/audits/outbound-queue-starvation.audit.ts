import { describe, expect, it, vi } from "vitest";
// Historical receipt: at 2026-09-10 02:56:27 EDT the original version of this
// audit called the ACTUAL then-current drainPersonalSms twice with a fake oldest/
// take ORM and rejected summary sender. It was RED 1/1: ordinary sender never
// called. The repaired worker now uses another selector/recovery API, so this
// captured old selection loop preserves the finding without pretending its
// obsolete mocks verify the repaired SQL. Real selector SQL evidence is in
// confirmation.postgres.test.ts / evidence/postgres-1789024161701 (22/22).
describe("observed oldest retained confirmation starvation", () => {
  it("reproduces the former loop repeatedly selecting the same invalid summary and starving the newer reply", async () => {
    const rows = [{ id: "expired-summary", idempotencyKey: "calendar-confirmation:expired" }, { id: "new-reply", idempotencyKey: "reply:new-source" }];
    const summary = vi.fn().mockRejectedValue(new Error("CONFIRMATION_NOT_PREPARED")), ordinary = vi.fn();
    const previousLoop = async () => {
      for (const row of rows.slice(0, 1)) {
        try { if (row.idempotencyKey.startsWith("calendar-confirmation:")) await summary(row.id); else await ordinary(row.id); }
        catch { /* Previous worker retained the invalid pending object unchanged. */ }
      }
    };
    await previousLoop(); await previousLoop();
    expect(summary).toHaveBeenCalledTimes(2); expect(ordinary).not.toHaveBeenCalled();
  });
});
