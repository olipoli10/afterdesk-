import { describe, expect, it, vi } from "vitest";
import { weatherQuestion, publicWeatherSelection } from "@/lib/sms-assistant/weather";
import { routeSmsAssistant } from "@/lib/sms-assistant/routing";
import { inspectPublicWeather, personalWeatherEnabled, processPersonalWeather } from "@/server/personal-assistant/weather-worker";
const now = Date.parse("2026-09-12T20:00:00Z");
const receivedAt = new Date(now).toISOString();
const fixture = () => ({ type: "Feature", geometry: { type: "Point", coordinates: [-73.5673, 45.5017, 20] },
  properties: { meta: { updated_at: "2026-09-12T19:00:00Z", units: { air_temperature: "celsius" } },
    timeseries: Array.from({ length: 24 }, (_, hour) => ({ time: new Date(Date.parse("2026-09-13T04:00:00Z") + hour * 3600_000).toISOString(),
      data: { instant: { details: { air_temperature: 10 + hour / 2 } }, next_1_hours: { summary: { symbol_code: hour === 5 ? "rain" : "partlycloudy_day" } } } })) } });
const env = { ENDVERA_PERSONAL_WEATHER_ENABLED: "true", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED",
  ENDVERA_EXTERNAL_AUTHORITY_REF: "ENDVERA-PERSONAL-20260910-100CAD", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
const context = () => ({ signal: new AbortController().signal, deadlineAt: now + 10_000 });
describe("public weather tool, not a canned forecast", () => {
  it.each(["Quel meteo a mtl demain", "Il annonce cmb demain a mtl", "Est-ce qu’il va pleuvoir demain à Montréal?", "What's the weather in Montreal tomorrow?"])
  ("recognizes city/day independently from exact phrasing: %s", body => {
    expect(weatherQuestion(body)).toBe(true);
    expect(publicWeatherSelection(body)).toEqual({ city: "montreal", dayOffset: 1 });
    expect(routeSmsAssistant({ body, requestId: "test", workspaceId: "test", senderVerified: true, workspaceBound: true }).lane).toBe("PUBLIC_RESEARCH");
  });
  it("does not route calendar actions to a weather lookup", () => {
    const body = "Ajoute un rendez-vous demain à mon calendrier";
    expect(weatherQuestion(body)).toBe(false);
    expect(routeSmsAssistant({ body, requestId: "test", workspaceId: "test", senderVerified: true, workspaceBound: true }).lane).toBe("EXTERNAL_ACTION");
  });
  it.each(["Météo demain", "Météo Québec demain", "Météo Montréal ou Toronto demain", "Météo Montréal lundi"])
  ("does not guess the city or requested date: %s", body => expect(publicWeatherSelection(body)).toBeNull());
  it("reports only observed forecast values with source and local date", () => {
    const result = inspectPublicWeather(fixture(), 1, receivedAt, now);
    expect(result.reply).toContain("2026-09-13"); expect(result.reply).toContain("10 à 22 °C");
    expect(result.reply).toContain("pluie possible"); expect(result.reply).toContain("MET Norway");
    expect(result.evidence.pointCount).toBe(24);
  });
  it.each(["stale", "future", "location", "units", "coverage", "duplicate"])("refuses invalid %s forecast evidence", kind => {
    const raw = fixture();
    if (kind === "stale") raw.properties.meta.updated_at = "2026-09-10T00:00:00Z";
    if (kind === "future") raw.properties.meta.updated_at = "2026-09-13T00:00:00Z";
    if (kind === "location") raw.geometry.coordinates[0] = 0;
    if (kind === "units") raw.properties.meta.units.air_temperature = "fahrenheit";
    if (kind === "coverage") raw.properties.timeseries.splice(1, 22);
    if (kind === "duplicate") raw.properties.timeseries[1].time = raw.properties.timeseries[0].time;
    expect(() => inspectPublicWeather(raw, 1, receivedAt, now)).toThrow();
  });
  it("does not call anything while disabled, expired, aborted or missing a city", async () => {
    const transport = vi.fn();
    expect(personalWeatherEnabled(env, Date.parse("2026-10-11"))).toBe(false);
    for (const e of [{}, { ...env, ENDVERA_PERSONAL_WEATHER_ENABLED: "false" }]) {
      await processPersonalWeather("Météo Montréal demain", receivedAt, context(), e, { fetch: transport, now: () => now });
    }
    await processPersonalWeather("Météo demain", receivedAt, context(), env, { fetch: transport, now: () => now });
    await processPersonalWeather("Météo Montréal demain", receivedAt, { ...context(), signal: AbortSignal.abort() }, env, { fetch: transport, now: () => now });
    expect(transport).not.toHaveBeenCalled();
  });
  it("sends only a fixed city point, never the full SMS or sender, and caches", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(fixture()), { status: 200, headers: { expires: new Date(now + 3600_000).toUTCString() } }));
    for (const body of ["Quel meteo a mtl demain", "Il annonce cmb demain a mtl"]) {
      const result = await processPersonalWeather(body, receivedAt, context(), env, { fetch: transport, now: () => now });
      expect(result.evidence?.kind).toBe("PUBLIC_WEATHER_FORECAST");
    }
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=45.5017&lon=-73.5673");
    expect(JSON.stringify(transport.mock.calls)).not.toContain("Quel meteo");
  });
});
