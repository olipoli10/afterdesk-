import { describe, expect, it } from "vitest";
import { personalCorrelatedCalendarPreview as preview } from "../src/lib/personal-correlated-calendar-preview";

function fixture() {
  const original = { role: "ORIGINAL_REQUEST", operationId: "original", requestHash: "1".repeat(64),
    text: "Ajoute 🧑‍🔧 Cafe\u0301 demain à 2h jusqu’à 16h.", receivedAt: "2026-09-10T23:59:59.999Z" };
  const answer = { role: "CLARIFICATION_REPLY", operationId: "answer", requestHash: "2".repeat(64),
    text: "14h", receivedAt: "2026-09-11T00:00:00.000Z" };
  const cite = (s: typeof original, quote: string) => ({ sourceOperationId: s.operationId, requestHash: s.requestHash,
    start: s.text.indexOf(quote), end: s.text.indexOf(quote) + quote.length, quote });
  return { version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "UNKNOWN",
    sources: [original, answer],
    citations: { title: cite(original, "🧑‍🔧 Cafe\u0301"), originalStart: cite(original, "demain à 2h"), originalEnd: cite(original, "16h"), answer: cite(answer, "14h") },
    anchorReceivedAt: original.receivedAt, clarifiedSlot: "START",
    draft: { title: "🧑‍🔧 Cafe\u0301", startsAt: "2026-09-11T18:00:00.001Z", endsAt: "2026-09-11T20:00:00.002Z", timezone: "America/Toronto" } };
}
function checked(raw: unknown = fixture()) {
  const result = preview(raw);
  expect(result.status).toBe("STRUCTURE_CHECKED_NOT_AUTHENTICATED");
  if (result.status !== "STRUCTURE_CHECKED_NOT_AUTHENTICATED") throw new Error("fixture unavailable");
  return result;
}
function frozenTree(value: unknown) {
  if (value && typeof value === "object") { expect(Object.isFrozen(value)).toBe(true); Object.values(value).forEach(frozenTree); }
}
describe("cross-review of local presentation only, no authenticated DTO", () => {
  it("retains UTF16 offsets through two astral pairs, ZWJ and decomposed accent", () => {
    const raw = fixture(), result = checked(raw);
    expect(result.evidence).toEqual(raw);
    expect(result.evidence.citations.title.quote).not.toBe(raw.citations.title.quote.normalize("NFC"));
    expect(result.evidence.citations.originalStart.start).toBe(raw.sources[0].text.indexOf("demain"));
    expect(result.localTimes.status).toBe("DISPLAYABLE");
    if (result.localTimes.status === "DISPLAYABLE") {
      expect(result.localTimes.start.localTime).toBe("14:00:00.001");
      expect(result.localTimes.end.localTime).toBe("16:00:00.002");
    }
  });
  it("does not accept a visually similar NFC replacement quote", () => {
    const raw = fixture(); raw.citations.title.quote = raw.citations.title.quote.normalize("NFC"); raw.draft.title = raw.citations.title.quote;
    expect(preview(raw).status).toBe("UNAVAILABLE");
  });
  it.each(["start", "end"] as const)("rejects %s at every interior surrogate boundary despite exact sliced quote", edge => {
    for (const emoji of ["🧑", "🔧"]) {
      const raw = fixture(), cut = raw.sources[0].text.indexOf(emoji) + 1;
      raw.citations.title[edge] = cut;
      raw.citations.title.quote = raw.sources[0].text.slice(raw.citations.title.start, raw.citations.title.end);
      raw.draft.title = raw.citations.title.quote.trim();
      expect(preview(raw).status).toBe("UNAVAILABLE");
    }
  });
  it("rejects a reply citation surrogate cut separately from the original", () => {
    const raw = fixture(); raw.sources[1].text = "🕑 14h";
    raw.citations.answer = { ...raw.citations.answer, start: 0, end: 1, quote: raw.sources[1].text.slice(0, 1) };
    expect(preview(raw).status).toBe("UNAVAILABLE");
  });
  it("does not accept code-point offsets in place of UTF16 offsets", () => {
    const raw = fixture(), position = raw.citations.originalStart.start;
    raw.citations.originalStart.start = [...raw.sources[0].text.slice(0, position)].length;
    expect(preview(raw).status).toBe("UNAVAILABLE");
  });
  it.each(["2026-09-10T23:59:59.999Z", "2026-09-10T23:59:59.998Z"])("refuses noncausal answer %s", instant => {
    const raw = fixture(); raw.sources[1].receivedAt = instant; expect(preview(raw).status).toBe("UNAVAILABLE");
  });
  it.each(["2026-09-11T18:00:00.001+00:00", "2026-09-11T24:00:00.000Z", "2026-09-11T18:00:60.001Z", "2026-02-29T18:00:00.001Z"])("refuses alternate or normalized UTC instant %s", instant => {
    const raw = fixture(); raw.draft.startsAt = instant; expect(preview(raw).status).toBe("UNAVAILABLE");
  });
  it("all nested returned structures are frozen and source copies remain private", () => {
    const raw = fixture(), result = checked(raw), saved = JSON.stringify(result);
    frozenTree(result); raw.sources.reverse(); raw.citations.title.start = 0; raw.draft.timezone = "UTC";
    expect(JSON.stringify(result)).toBe(saved);
    expect(Reflect.set(result.evidence.citations.answer, "requestHash", "x")).toBe(false);
    expect(Reflect.set(result, "approvalAvailable", true)).toBe(false);
  });
  it("consistent invented hashes and declared provenance never become authentication", () => {
    const raw = fixture(); raw.provenance = "SYNTHETIC_LOCAL";
    raw.sources[0].requestHash = "f".repeat(64);
    for (const key of ["title", "originalStart", "originalEnd"] as const) raw.citations[key].requestHash = raw.sources[0].requestHash;
    const result = checked(raw);
    expect(result).toMatchObject({ approvalAvailable: false, executionAuthorized: false, sourceAuthenticityVerified: false,
      hashCryptographicallyVerified: false, semanticInterpretationVerified: false, provenanceLabel: "SYNTHETIC_LOCAL" });
    expect(result).not.toHaveProperty("requestHash"); expect(result).not.toHaveProperty("operationId");
  });
  it("semantic mismatch remains only structure-checked, never an event validation", () => {
    const raw = fixture(); raw.draft.startsAt = "2035-01-01T10:00:00.000Z"; raw.draft.endsAt = "2035-01-01T11:00:00.000Z";
    const result = checked(raw); expect(result.semanticInterpretationVerified).toBe(false); expect(result.approvalAvailable).toBe(false);
  });
  it.each(["draft", "sources", "citations"])("rejects nested actionable additions under %s", where => {
    const raw = fixture();
    if (where === "draft") Object.assign(raw.draft, { approvalAvailable: true });
    if (where === "sources") Object.assign(raw.sources[0], { approvalAvailable: true });
    if (where === "citations") Object.assign(raw.citations.answer, { approvalAvailable: true });
    const result = preview(raw); expect(result.status).toBe("UNAVAILABLE"); expect(result).not.toHaveProperty("evidence"); frozenTree(result);
  });
});
