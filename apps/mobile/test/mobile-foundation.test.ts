import { describe, expect, it, vi } from "vitest";
import { MobileApi } from "../src/lib/api";
import {
  beginAttempt,
  createFollowUpAttempt,
  createPaymentAttempt,
  finishAttempt,
} from "../src/lib/commands";
import { resolveMobileApiBaseUrl } from "../src/lib/config";
import { mobileBootstrapSchema, parseMobileCockpit } from "../src/lib/contracts";

function project() {
  return {
    id: "project-1",
    code: "LAVAL-001",
    name: "Rénovation Laval",
    status: "active",
    _count: { contacts: 1, calendarItems: 0, openLoops: 0 },
  };
}

function cockpit(role: "OWNER" | "FIELD_WORKER") {
  const financialsVisible = role === "OWNER";
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-01T12:00:00.000Z",
    workspace: {
      id: "workspace-1",
      name: "ENDVERA Construction",
      defaultTimezone: "America/Toronto",
      defaultLocale: "fr-CA",
      projects: [project()],
      role,
    },
    permissions: {
      financialsVisible,
      canManageReceivables: financialsVisible,
      canScheduleFollowUps: financialsVisible,
      canApprovePreparedActions: financialsVisible,
      externalTransportAuthorized: false,
    },
    projects: [project()],
    calendar: [],
    openLoops: [],
    actions: [],
    receivables: [],
  };
}

describe("mobile configuration", () => {
  it("allows local HTTP only in development and requires HTTPS elsewhere", () => {
    expect(resolveMobileApiBaseUrl(undefined, { development: true })).toBe("http://127.0.0.1:3000");
    expect(resolveMobileApiBaseUrl("http://10.0.2.2:3000/", { development: true })).toBe("http://10.0.2.2:3000");
    expect(resolveMobileApiBaseUrl("https://api.endvera.ai", { development: false })).toBe("https://api.endvera.ai");
    expect(() => resolveMobileApiBaseUrl("http://api.endvera.ai", { development: false })).toThrow("MOBILE_API_URL_HTTPS_REQUIRED");
    expect(() => resolveMobileApiBaseUrl("https://user:secret@api.endvera.ai", { development: false })).toThrow("MOBILE_API_URL_INVALID");
  });
});

describe("strict mobile contracts", () => {
  it("accepts a bounded bootstrap and role-shaped cockpits", () => {
    expect(
      mobileBootstrapSchema.parse({
        schemaVersion: 1,
        generatedAt: "2026-09-01T12:00:00.000Z",
        user: { id: "user-1", name: "Olivier", email: "olivier@example.invalid" },
        workspaces: [],
      }),
    ).toBeTruthy();
    expect(parseMobileCockpit(cockpit("OWNER")).workspace.role).toBe("OWNER");
    expect(parseMobileCockpit(cockpit("FIELD_WORKER")).workspace.role).toBe("FIELD_WORKER");
  });

  it("refuses financial leakage and unknown response fields in the field projection", () => {
    const leaked = cockpit("FIELD_WORKER");
    leaked.receivables = [
      {
        id: "receivable-1",
        project: { code: "LAVAL-001", name: "Rénovation Laval" },
        status: "open",
        dueAt: "2026-09-10T12:00:00.000Z",
        followUps: [],
        outstandingAmountMinor: 120_000,
      } as never,
    ];
    expect(() => parseMobileCockpit(leaked)).toThrow("MOBILE_FIELD_PROJECTION_REFUSED");
    expect(() => parseMobileCockpit({ ...cockpit("OWNER"), sessionToken: "secret" })).toThrow();
  });

  it("refuses a role whose permission envelope is inconsistent", () => {
    const invalidCockpit = cockpit("FIELD_WORKER");
    invalidCockpit.permissions.canManageReceivables = true;
    expect(() => parseMobileCockpit(invalidCockpit)).toThrow("MOBILE_ROLE_PERMISSIONS_REFUSED");

    const invalidBootstrap = {
      schemaVersion: 1,
      generatedAt: "2026-09-01T12:00:00.000Z",
      user: { id: "user-1", name: "Olivier", email: "olivier@example.invalid" },
      workspaces: [
        {
          id: "workspace-1",
          name: "ENDVERA Construction",
          defaultTimezone: "America/Toronto",
          defaultLocale: "fr-CA",
          role: "FIELD_WORKER",
          permissions: {
            financialsVisible: false,
            canManageReceivables: true,
            canScheduleFollowUps: false,
            canApprovePreparedActions: false,
            externalTransportAuthorized: false,
          },
        },
      ],
    };
    expect(() => mobileBootstrapSchema.parse(invalidBootstrap)).toThrow(
      "MOBILE_ROLE_PERMISSIONS_REFUSED",
    );
  });
});

describe("mobile API boundary", () => {
  it("sends the Better Auth cookie and maps unauthenticated responses", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("cookie")).toBe("better-auth.session_token=synthetic");
      return new Response(JSON.stringify({ error: "Not signed in." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });
    const api = new MobileApi({
      baseUrl: "http://127.0.0.1:3000",
      fetchImpl,
      getCookie: () => "better-auth.session_token=synthetic",
    });
    await expect(api.bootstrap()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a successful response that does not match the submitted command", async () => {
    const attempt = createPaymentAttempt(
      {
        workspaceId: "workspace-1",
        receivableId: "receivable-1",
        expectedVersion: 1,
        amountMinor: 50_000,
        receivedAt: "2026-09-01T12:00:00.000Z",
        sourceRef: "mobile:test",
        note: null,
      },
      () => "effect-mismatch",
    );
    const api = new MobileApi({
      baseUrl: "http://127.0.0.1:3000",
      getCookie: () => "better-auth.session_token=synthetic",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            requestId: attempt.command.requestId,
            resultType: "FOLLOW_UP_SCHEDULED",
            replayed: false,
            data: {},
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    await expect(api.command(attempt.command)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});

describe("stable command attempts", () => {
  it("keeps the exact identifiers for an unknown-outcome retry and blocks double dispatch", () => {
    const payment = createPaymentAttempt(
      {
        workspaceId: "workspace-1",
        receivableId: "receivable-1",
        expectedVersion: 1,
        amountMinor: 50_000,
        receivedAt: "2026-09-01T12:00:00.000Z",
        sourceRef: "mobile:test",
        note: null,
      },
      () => "fixed-effect",
    );
    const sending = beginAttempt(payment);
    expect(() => beginAttempt(sending)).toThrow("MOBILE_COMMAND_ALREADY_DISPATCHED");
    const unknown = finishAttempt(sending, "OUTCOME_UNKNOWN", "Résultat inconnu");
    const retry = beginAttempt(unknown);
    expect(retry.command).toEqual(payment.command);
    expect(retry.command.requestId).toBe("mobile-payment-request:fixed-effect");
    if (retry.command.type !== "RECORD_PAYMENT") throw new Error("unreachable");
    expect(retry.command.payload.eventId).toBe("mobile-payment:fixed-effect");
  });

  it("builds follow-ups that stay inside the canonical R7 command contract", () => {
    const followUp = createFollowUpAttempt(
      {
        workspaceId: "workspace-1",
        projectId: "project-1",
        contactId: "contact-1",
        target: { kind: "RECEIVABLE_PAYMENT", receivableId: "receivable-1" },
        dueAt: "2026-09-02T12:00:00.000Z",
        channel: "SMS",
        body: "Bonjour Marc, rappel concernant la facture 184.",
      },
      () => "fixed-follow-up",
    );
    expect(followUp.command).toMatchObject({
      schemaVersion: 1,
      requestId: "mobile-follow-up-request:fixed-follow-up",
      type: "SCHEDULE_FOLLOW_UP",
      payload: { idempotencyKey: "mobile-follow-up:fixed-follow-up" },
    });
  });
});
