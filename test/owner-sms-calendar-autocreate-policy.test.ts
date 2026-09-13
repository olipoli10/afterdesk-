import { describe, expect, it, vi } from "vitest";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import {
  authorizeOwnerSmsCalendarAutocreateInTransaction,
  inspectOwnerSmsCalendarAutocreatePolicy,
  OWNER_SMS_CALENDAR_AUTOCREATE_AUTHORITY,
} from "@/server/personal-assistant/owner-sms-calendar-autocreate";

const base = {
  sourceText: "Ajoute à mon calendrier ce soir à 11 h du soir un rendez-vous d'une heure avec Marc au Randolph",
  receivedAt: "2026-09-13T22:29:37.325Z",
  inspectedAt: "2026-09-13T22:29:40.000Z",
  startsAt: "2026-09-14T03:00:00.000Z",
  endsAt: "2026-09-14T04:00:00.000Z",
};

describe("verified-owner SMS calendar autocreate policy", () => {
  it("accepts one explicit future create command with a bounded duration", () => {
    expect(inspectOwnerSmsCalendarAutocreatePolicy(base)).toEqual({ eligible: true });
  });

  it.each([
    ["Dis-moi ce que j'ai dans mon calendrier", "EXPLICIT_CREATE_COMMAND_REQUIRED"],
    ["N'ajoute pas ce rendez-vous à mon calendrier demain à 14 h", "CONDITIONAL_OR_NEGATED_REQUEST"],
    ["Modifie mon calendrier demain à 14 h", "CREATE_ONLY_REQUIRED"],
    ["Ajoute à mon calendrier demain à 14 h et appelle Marc", "OTHER_EFFECT_REQUESTED"],
  ])("refuses unsupported wording: %s", (sourceText, reason) => {
    expect(inspectOwnerSmsCalendarAutocreatePolicy({ ...base, sourceText })).toEqual({ eligible: false, reason });
  });

  it.each([
    [{ startsAt: "2026-09-13T21:00:00.000Z", endsAt: "2026-09-13T22:00:00.000Z" }, "FUTURE_EVENT_REQUIRED"],
    [{ startsAt: "2026-09-14T03:00:00.000Z", endsAt: "2026-09-14T03:00:30.000Z" }, "BOUNDED_DURATION_REQUIRED"],
    [{ startsAt: "2026-09-14T03:00:00.000Z", endsAt: "2026-09-15T03:00:01.000Z" }, "BOUNDED_DURATION_REQUIRED"],
    [{ startsAt: "not-a-date", endsAt: "2026-09-14T04:00:00.000Z" }, "VALID_TIME_REQUIRED"],
  ])("refuses unsafe temporal bounds: %j", (times, reason) => {
    expect(inspectOwnerSmsCalendarAutocreatePolicy({ ...base, ...times })).toEqual({ eligible: false, reason });
  });

  it("stops before touching storage while the dedicated standing authority is off", async () => {
    const forbiddenTx = new Proxy({}, { get: () => { throw new Error("STORAGE_MUST_NOT_BE_TOUCHED"); } });
    await expect(authorizeOwnerSmsCalendarAutocreateInTransaction(
      forbiddenTx as never,
      { claim: { operationId: "source", workspaceId: "workspace", userId: "owner", attempt: 1, leaseUntil: "2026-09-13T23:00:00.000Z" }, signal: new AbortController().signal, deadlineAt: Date.now() + 10_000 },
      {},
      {},
    )).resolves.toEqual({ status: "APP_REVIEW_ONLY", reason: "DISABLED", executionAuthorized: false });
  });

  it("rejects a multi-action review before any durable authorization check", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T22:29:40.000Z"));
    try {
      const action = {
        actionId: "action",
        kind: "PREPARE_CALENDAR_EVENT",
        status: "PREPARED_UNSENT",
        operationId: "calendar",
        requestHash: "a".repeat(64),
        draft: { title: "Marc au Randolph", startsAt: base.startsAt, endsAt: base.endsAt, timezone: "America/Toronto" },
      };
      const review = {
        status: "REVIEW_PREPARED_NOT_AUTHORIZED",
        executionAuthorized: false,
        externalTransportPerformed: false,
        accounting: "UNSETTLED",
        automaticRetry: false,
        semanticIntentVerified: false,
        source: { operationId: "source", text: base.sourceText, receivedAt: base.receivedAt, timezone: "America/Toronto" },
        modelChildOperationId: "model-child",
        actions: [action, { ...action, actionId: "second", operationId: "second-calendar" }],
      };
      const forbiddenTx = new Proxy({}, { get: () => { throw new Error("STORAGE_MUST_NOT_BE_TOUCHED"); } });
      await expect(authorizeOwnerSmsCalendarAutocreateInTransaction(
        forbiddenTx as never,
        { claim: { operationId: "source", workspaceId: "workspace", userId: "owner", attempt: 1, leaseUntil: "2026-09-13T23:00:00.000Z" }, signal: new AbortController().signal, deadlineAt: Date.now() + 10_000 },
        review,
        {
          ENDVERA_OWNER_SMS_CALENDAR_AUTOCREATE_ENABLED: "true",
          ENDVERA_OWNER_SMS_CALENDAR_AUTOCREATE_AUTHORITY_REF: OWNER_SMS_CALENDAR_AUTOCREATE_AUTHORITY,
          ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true",
          ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
          ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z",
        },
      )).resolves.toEqual({ status: "APP_REVIEW_ONLY", reason: "SINGLE_EXACT_DEVICE_CREATE_REQUIRED", executionAuthorized: false });
    } finally {
      vi.useRealTimers();
    }
  });
});
