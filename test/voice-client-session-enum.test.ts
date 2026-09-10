import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRawUnsafe: mocks.query } }));
import { createVoiceIntakeSession } from "@/server/model-gateway/voice/sessions";
const now = new Date("2026-09-10T14:00:00.000Z");
const base = { actor: { role: "CLIENT", id: "synthetic-client" }, consentAccepted: true, consentVersion: "LOCAL_TEST_ONLY", maxTotalCostMicros: 100_000n, now };
beforeEach(() => {
  vi.resetAllMocks(); mocks.query.mockImplementation(async (_sql: string, ...args: unknown[]) => [{ id: args[0], clientId: args[1], languageHint: args[2], status: "open" }]);
});
describe("CLIENT voice INSERT enum binding (native 42804 regression)", () => {
  it.each(["en", "fr", "es", "tl"])("binds validated %s through explicit PostgreSQL enum conversion", async languageHint => {
    const result = await createVoiceIntakeSession({ ...base, languageHint });
    const [sql, ...args] = mocks.query.mock.calls[0];
    expect(sql).toContain('$3::"VoiceIntakeLanguage"');
    expect(args[2]).toBe(languageHint); expect(sql).not.toContain(`'${languageHint}'`);
    expect(result).toMatchObject({ clientId: base.actor.id, languageHint, status: "open" });
    expect(Object.isFrozen(result)).toBe(true); expect(mocks.query).toHaveBeenCalledTimes(1);
    // No consent/TTL/budget change accompanies the enum repair.
    expect(args[3]).toBe(base.consentVersion); expect(args[4]).toEqual(now); expect(args[10]).toBe(base.maxTotalCostMicros);
    expect(args[11]).toEqual(new Date(now.getTime() + 24 * 60 * 60_000));
  });
  it.each(["auto", 'fr\";DROP TABLE x;--'])("refuses unsupported %s before SQL", async languageHint => {
    await expect(createVoiceIntakeSession({ ...base, languageHint })).rejects.toThrow("voice_language_unsupported");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("preserves explicit CLIENT identity and consent requirements", async () => {
    await expect(createVoiceIntakeSession({ ...base, languageHint: "fr", consentAccepted: false })).rejects.toThrow("voice_consent_missing");
    await expect(createVoiceIntakeSession({ ...base, languageHint: "fr", actor: { role: "ADMIN", id: base.actor.id } })).rejects.toThrow("voice_session_not_owned");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
