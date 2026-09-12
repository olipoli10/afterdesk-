/** Public city selection only, never inferred GPS or a private address. */
const normalize = (body: string) => body.normalize("NFKD").replace(/\p{M}|\p{Cf}/gu, "").toLowerCase().replace(/[’‘]/gu, "'");
export function weatherQuestion(body: string) {
  const text = normalize(body);
  return /\b(?:meteo|weather|temperature|pleuvoir|pluie|neiger|neige)\b/u.test(text)
    || /\b(?:quel|quelle)\s+(?:temps|temperature)\b/u.test(text)
    || /\b(?:il|ca)\s+annonce\s+(?:cmb|combien|quoi)\b/u.test(text);
}
export function publicWeatherSelection(body: string): { city: "montreal"; dayOffset: 0 | 1 | 2 } | null {
  if (!weatherQuestion(body)) return null;
  const text = normalize(body);
  // This pilot has one verified city point. Never silently use it elsewhere.
  if (!/\b(?:mtl|montreal)\b/u.test(text) || /\b(?:toronto|quebec|laval|ottawa|longueuil|paris|vs|versus|ou)\b/u.test(text)) return null;
  if (/\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine|hier)\b|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/u.test(text)) return null;
  return { city: "montreal", dayOffset: /\bapres[- ]demain\b/u.test(text) ? 2 : /\b(?:demain|tomorrow)\b/u.test(text) ? 1 : 0 };
}
