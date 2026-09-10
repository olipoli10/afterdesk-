import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarClient } from "../src/server/personal-assistant/google-client";

const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
  ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret",
  GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example",
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-09-10T00:00:00Z" };
const now = () => Date.parse("2026-09-09T00:00:00Z");
const tokens = { accessToken: "synthetic", refreshToken: "synthetic", subject: "synthetic", scopes: ["https://www.googleapis.com/auth/calendar.events.readonly"], expiresAt: now() + 3600000 };
const range = ["2026-09-09T00:00:00Z", "2026-09-10T00:00:00Z"] as const;
afterEach(() => vi.restoreAllMocks());

describe("Google client source cancellation through its reviewed transport", () => {
  it("does not start transport for an already-aborted source", async () => {
    const source = new AbortController(); source.abort(); const transport = vi.fn<typeof fetch>();
    const client = new GoogleCalendarClient(env, transport, now, source.signal);
    await expect(client.listEvents(tokens, ...range)).rejects.toThrow("GOOGLE_TRANSPORT_UNAVAILABLE");
    expect(transport).not.toHaveBeenCalled(); expect(client.transportAttempts).toBe(0);
  });

  it("propagates source abortion into transport and rejects a late successful response without retry", async () => {
    const source = new AbortController(); let observed: AbortSignal | undefined;
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      observed = init!.signal as AbortSignal; expect(observed.aborted).toBe(false);
      source.abort(); expect(observed.aborted).toBe(true);
      return Response.json({ items: [], nextPageToken: "must-not-fetch" });
    });
    const client = new GoogleCalendarClient(env, transport, now, source.signal);
    await expect(client.listEvents(tokens, ...range)).rejects.toThrow("GOOGLE_TRANSPORT_UNAVAILABLE");
    expect(observed?.aborted).toBe(true); expect(transport).toHaveBeenCalledTimes(1); expect(client.transportAttempts).toBe(1);
  });

  it("preserves the existing ten-second timeout when a source signal is supplied", async () => {
    const source = new AbortController(); const timeout = new AbortController();
    const makeTimeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      timeout.abort(); expect(init!.signal?.aborted).toBe(true); expect(source.signal.aborted).toBe(false);
      return Response.json({ items: [] });
    });
    await expect(new GoogleCalendarClient(env, transport, now, source.signal).listEvents(tokens, ...range)).rejects.toThrow("GOOGLE_TRANSPORT_UNAVAILABLE");
    expect(makeTimeout).toHaveBeenCalledWith(10000); expect(transport).toHaveBeenCalledTimes(1);
  });

  it("refuses a body that finishes after cancellation and does not follow its next page", async () => {
    const source = new AbortController();
    const stream = new ReadableStream<Uint8Array>({ pull(controller) {
      source.abort(); controller.enqueue(new TextEncoder().encode('{"items":[],"nextPageToken":"must-not-fetch"}')); controller.close();
    } }, { highWaterMark: 0 });
    const transport = vi.fn<typeof fetch>(async () => new Response(stream));
    await expect(new GoogleCalendarClient(env, transport, now, source.signal).listEvents(tokens, ...range)).rejects.toThrow("GOOGLE_TRANSPORT_UNAVAILABLE");
    expect(transport).toHaveBeenCalledTimes(1); expect(stream.locked).toBe(false);
  });

  it("keeps normal pagination working with an active source signal", async () => {
    const source = new AbortController();
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ items: [], nextPageToken: "two" })).mockResolvedValueOnce(Response.json({ items: [] }));
    await expect(new GoogleCalendarClient(env, transport, now, source.signal).listEvents(tokens, ...range)).resolves.toMatchObject({ complete: true, source: "GOOGLE_CALENDAR" });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls.every(([, init]) => init?.redirect === "error" && init.signal && !init.signal.aborted)).toBe(true);
  });
});
