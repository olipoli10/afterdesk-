import { describe, expect, it } from "vitest";
import {
  assertVoiceSessionAccess,
  prepareVoiceSessionCreation,
} from "@/server/model-gateway/voice/sessions";

const now = new Date("2026-08-20T12:00:00.000Z");

describe("voice intake session authorization", () => {
  it("freezes an explicitly consented client session", () => {
    const prepared = prepareVoiceSessionCreation({
      actor: { id: "client-1", role: "CLIENT" },
      languageHint: "fr",
      consentAccepted: true,
      consentVersion: "voice-disclosure-v1",
      maxTotalCostMicros: 500_000n,
      now,
    });
    expect(prepared).toMatchObject({
      clientId: "client-1",
      status: "open",
      languageHint: "fr",
      maxDurationMs: 600_000,
      maxSegmentDurationMs: 45_000,
      maxSegments: 14,
    });
    expect(prepared.expiresAt.toISOString()).toBe("2026-08-21T12:00:00.000Z");
    expect(Object.isFrozen(prepared)).toBe(true);
  });

  it("refuses missing consent, non-clients, unknown languages and absent cost authority", () => {
    const base = {
      actor: { id: "client-1", role: "CLIENT" },
      languageHint: "en",
      consentAccepted: true,
      consentVersion: "voice-disclosure-v1",
      maxTotalCostMicros: 1n,
      now,
    } as const;
    expect(() => prepareVoiceSessionCreation({ ...base, consentAccepted: false }))
      .toThrow("voice_consent_missing");
    expect(() => prepareVoiceSessionCreation({ ...base, actor: { id: "admin-1", role: "ADMIN" } }))
      .toThrow("voice_session_not_owned");
    expect(() => prepareVoiceSessionCreation({ ...base, languageHint: "auto" }))
      .toThrow("voice_language_unsupported");
    expect(() => prepareVoiceSessionCreation({ ...base, maxTotalCostMicros: 0n }))
      .toThrow("voice_not_configured");
  });

  it("checks owner, expiry and cancellable status at point of use", () => {
    const session = {
      id: "session-1",
      clientId: "client-1",
      status: "open",
      consentVersion: "voice-disclosure-v1",
      consentedAt: now,
      expiresAt: new Date("2026-08-21T12:00:00.000Z"),
    } as const;
    expect(assertVoiceSessionAccess(session, { id: "client-1", role: "CLIENT" }, now)).toBe(session);
    expect(() => assertVoiceSessionAccess(session, { id: "client-2", role: "CLIENT" }, now))
      .toThrow("voice_session_not_owned");
    expect(() => assertVoiceSessionAccess(session, { id: "client-1", role: "CLIENT" }, session.expiresAt))
      .toThrow("voice_session_expired");
    expect(() => assertVoiceSessionAccess({ ...session, status: "cancelled" }, { id: "client-1", role: "CLIENT" }, now))
      .toThrow("voice_session_closed");
  });
});
