import "server-only";
import { createHash } from "node:crypto";
import { addDays, format, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { z } from "zod";
import { publicWeatherSelection } from "@/lib/sms-assistant/weather";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import type { ConnectorEnvironment } from "./google-client";

// PUBLIC city centroid only. No SMS, sender, history, credential or GPS is sent.
const CITY = { name: "Montréal", lat: 45.5017, lon: -73.5673, timezone: "America/Toronto" } as const;
const URL = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${CITY.lat}&lon=${CITY.lon}`;
const LICENSE = "https://api.met.no/doc/License";
const period = z.object({ summary: z.object({ symbol_code: z.string().max(100) }) });
const forecastSchema = z.object({ type: z.literal("Feature"),
  geometry: z.object({ type: z.literal("Point"), coordinates: z.array(z.number().finite()).min(2).max(3) }),
  properties: z.object({ meta: z.object({ updated_at: z.string().datetime(), units: z.object({ air_temperature: z.literal("celsius") }) }),
    timeseries: z.array(z.object({ time: z.string().datetime(), data: z.object({
      instant: z.object({ details: z.object({ air_temperature: z.number().finite().min(-100).max(70) }) }),
      next_1_hours: period.optional(), next_6_hours: period.optional(), next_12_hours: period.optional(),
    }) })).min(1).max(500),
  }),
});
type Forecast = z.infer<typeof forecastSchema>;
type Cache = { body: Forecast; hash: string; expiresAt: number; lastModified: string | null; retrievedAt: string };
let cache: Cache | undefined;
let blockedUntil = 0;
export function personalWeatherEnabled(env: ConnectorEnvironment, now = Date.now()) {
  return env.ENDVERA_PERSONAL_WEATHER_ENABLED === "true" && env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED === "ENABLED"
    && env.ENDVERA_EXTERNAL_AUTHORITY_REF === PERSONAL_MODEL_AUTHORITY
    && Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT ?? "") > now;
}
function validateFresh(body: Forecast, now: number) {
  const updated = Date.parse(body.properties.meta.updated_at);
  if (updated > now + 300_000 || now - updated > 12 * 3600_000) throw new Error("WEATHER_STALE");
  if (Math.abs(body.geometry.coordinates[0] - CITY.lon) > 0.02 || Math.abs(body.geometry.coordinates[1] - CITY.lat) > 0.02) throw new Error("WEATHER_LOCATION_MISMATCH");
}
async function boundedBody(response: Response) {
  if (!response.body) throw new Error("WEATHER_EMPTY");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const item = await reader.read(); if (item.done) break;
      bytes += item.value.byteLength; if (bytes > 262_144) throw new Error("WEATHER_RESPONSE_LIMIT");
      chunks.push(item.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
/** Bound traffic and honour upstream cache validators. Next's shared cache also
 * avoids fetching the same city for every cold webhook instance. */
async function loadForecast(signal: AbortSignal, transport: typeof fetch, now: () => number): Promise<Cache> {
  if (cache && cache.expiresAt > now()) { validateFresh(cache.body, now()); return cache; }
  if (blockedUntil > now()) throw new Error("WEATHER_RATE_LIMITED");
  const response = await transport(URL, { method: "GET", signal, redirect: "error",
    headers: { "User-Agent": "ENDVERA/0.2 (https://afterdesk.co)", Accept: "application/json",
      ...(cache?.lastModified ? { "If-Modified-Since": cache.lastModified } : {}) }, next: { revalidate: 3600 },
  });
  if (response.status === 429) { blockedUntil = now() + 1800_000; throw new Error("WEATHER_RATE_LIMITED"); }
  const expires = Date.parse(response.headers.get("expires") ?? "");
  const expiresAt = Number.isFinite(expires) ? Math.min(expires, now() + 24 * 3600_000) : now() + 3600_000;
  if (response.status === 304 && cache) { validateFresh(cache.body, now()); cache = { ...cache, expiresAt }; return cache; }
  if (response.status !== 200) throw new Error("WEATHER_HTTP_ERROR");
  const raw = await boundedBody(response); const body = forecastSchema.parse(JSON.parse(raw)); validateFresh(body, now());
  cache = { body, hash: createHash("sha256").update(raw).digest("hex"), expiresAt,
    lastModified: response.headers.get("last-modified"), retrievedAt: new Date(now()).toISOString() };
  return cache;
}
const CONDITIONS: Record<string, string> = { clearsky: "ciel dégagé", fair: "peu nuageux", partlycloudy: "partiellement nuageux", cloudy: "nuageux", fog: "brouillard" };
function condition(code: string) {
  const name = code.replace(/_(day|night|polartwilight)$/u, "");
  if (name.includes("thunder")) return "risque d’orage";
  if (name.includes("sleet")) return "pluie et neige possibles";
  if (name.includes("snow")) return "neige possible";
  if (name.includes("rain")) return "pluie possible";
  return CONDITIONS[name] ?? "conditions variables";
}
export function inspectPublicWeather(raw: unknown, dayOffset: 0 | 1 | 2, receivedAt: string, now = Date.now()) {
  const body = forecastSchema.parse(raw); validateFresh(body, now);
  const received = new Date(receivedAt); if (!Number.isFinite(received.getTime())) throw new Error("WEATHER_DATE_INVALID");
  const localStart = addDays(startOfDay(toZonedTime(received, CITY.timezone)), dayOffset);
  const start = fromZonedTime(localStart, CITY.timezone).getTime();
  const end = fromZonedTime(addDays(localStart, 1), CITY.timezone).getTime();
  const from = dayOffset === 0 ? Math.max(start, received.getTime() - 3600_000) : start;
  const points = body.properties.timeseries.filter(point => Date.parse(point.time) >= from && Date.parse(point.time) < end);
  if (end <= now || points.length < 2 || Date.parse(points[0].time) - from > 3 * 3600_000
    || end - Date.parse(points.at(-1)!.time) > 3 * 3600_000
    || points.some((point, index) => index > 0 && (Date.parse(point.time) <= Date.parse(points[index - 1].time)
      || Date.parse(point.time) - Date.parse(points[index - 1].time) > 3 * 3600_000))) throw new Error("WEATHER_PERIOD_INCOMPLETE");
  const temperatures = points.map(point => point.data.instant.details.air_temperature);
  const conditions = [...new Set(points.map(point => condition((point.data.next_1_hours ?? point.data.next_6_hours ?? point.data.next_12_hours)?.summary.symbol_code ?? "")))];
  const risks = conditions.filter(value => /possible|orage/u.test(value));
  const summary = (risks.length ? risks : conditions).slice(0, 2).join(" / ");
  const date = format(localStart, "yyyy-MM-dd");
  const time = new Date(body.properties.meta.updated_at).toLocaleTimeString("fr-CA", { timeZone: CITY.timezone, hour: "2-digit", minute: "2-digit" });
  const label = dayOffset === 1 ? "Demain" : dayOffset === 2 ? "Après-demain" : "Aujourd’hui (heures restantes)";
  const reply = `${label} à Montréal (${date}) : environ ${Math.round(Math.min(...temperatures))} à ${Math.round(Math.max(...temperatures))} °C selon les heures prévues; ${summary}. Prévision mise à jour à ${time}, heure de Montréal. Source : MET Norway, résumé ENDVERA. ${LICENSE}`;
  return { reply, evidence: { provider: "MET_NORWAY", sourceUrl: URL, licenseUrl: LICENSE, city: CITY.name, date,
    timezone: CITY.timezone, updatedAt: body.properties.meta.updated_at, pointCount: points.length, kind: "PUBLIC_WEATHER_FORECAST" } };
}
type WeatherResult = { reply: string; evidence?: ReturnType<typeof inspectPublicWeather>["evidence"] & { retrievedAt: string; responseSha256: string } };
export async function processPersonalWeather(body: string, receivedAt: string, context: { signal: AbortSignal; deadlineAt: number },
  env: ConnectorEnvironment = process.env, deps: { fetch?: typeof fetch; now?: () => number } = {}): Promise<WeatherResult> {
  const now = deps.now ?? Date.now;
  if (!personalWeatherEnabled(env, now())) return { reply: "La source météo n’est pas encore activée sur le serveur. Aucune permission du téléphone n’est nécessaire." };
  const selection = publicWeatherSelection(body);
  if (!selection) return { reply: "Pour la météo, précise la ville et le jour. Le pilote couvre Montréal aujourd’hui, demain ou après-demain; je ne connais pas ta position automatiquement." };
  if (context.signal.aborted || context.deadlineAt - now() < 1000) return { reply: "La source météo n’a pas pu être consultée à temps. Je n’invente pas de prévision." };
  const signal = AbortSignal.any([context.signal, AbortSignal.timeout(Math.min(8000, context.deadlineAt - now() - 500))]);
  try {
    const saved = await loadForecast(signal, deps.fetch ?? fetch, now);
    if (signal.aborted || !personalWeatherEnabled(env, now())) throw new Error("WEATHER_CANCELLED");
    const result = inspectPublicWeather(saved.body, selection.dayOffset, receivedAt, now());
    return { ...result, evidence: { ...result.evidence, retrievedAt: saved.retrievedAt, responseSha256: saved.hash } };
  } catch {
    return { reply: "La source météo est temporairement indisponible ou trop ancienne pour une prévision fiable. Aucun chiffre n’a été inventé." };
  }
}
