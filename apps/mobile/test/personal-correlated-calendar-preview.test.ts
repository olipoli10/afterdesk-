import { afterEach, describe, expect, it, vi } from "vitest";
import { personalCorrelatedCalendarPreview } from "../src/lib/personal-correlated-calendar-preview";

function fixture() {
  const original = { role: "ORIGINAL_REQUEST", operationId: "original", requestHash: "a".repeat(64),
    text: "Ajoute 🏗️ visite demain à 2h jusqu’à 16h.", receivedAt: "2026-09-10T23:58:00.000Z" };
  const reply = { role: "CLARIFICATION_REPLY", operationId: "reply", requestHash: "b".repeat(64),
    text: "14h", receivedAt: "2026-09-11T00:02:00.000Z" };
  const quote = (src: typeof original, text: string) => ({ sourceOperationId: src.operationId, requestHash: src.requestHash,
    start: src.text.indexOf(text), end: src.text.indexOf(text) + text.length, quote: text });
  return {
    version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "SYNTHETIC_LOCAL",
    sources: [original, reply],
    citations: { title: quote(original, "🏗️ visite"), originalStart: quote(original, "demain à 2h"), originalEnd: quote(original, "16h"), answer: quote(reply, "14h") },
    anchorReceivedAt: original.receivedAt, clarifiedSlot: "START",
    draft: { title: "🏗️ visite", startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T20:00:00.000Z", timezone: "America/Toronto" },
  };
}
type Fixture = ReturnType<typeof fixture>;
function inspect(value: unknown = fixture()) {
  const result = personalCorrelatedCalendarPreview(value);
  expect(result.status).toBe("STRUCTURE_CHECKED_NOT_AUTHENTICATED");
  if (result.status !== "STRUCTURE_CHECKED_NOT_AUTHENTICATED") throw new Error("fixture rejected");
  return result;
}
afterEach(() => vi.restoreAllMocks());

describe("unwired two-source presentation utility", () => {
  it("retains both full messages, Unicode quotes, original midnight anchor and exact raw draft", () => {
    const input = fixture(), result = inspect(input);
    expect(result.evidence).toEqual(input);
    expect(result.evidence.sources[0].text).toBe(input.sources[0].text);
    expect(result.evidence.sources[1].text).toBe("14h");
    expect(result.localTimes.status).toBe("DISPLAYABLE");
    if (result.localTimes.status === "DISPLAYABLE") {
      expect(result.localTimes.start.localTime).toBe("14:00:00.000");
      expect(result.localTimes.start.utcOffset).toBe("UTC−04:00");
    }
    expect(result.approvalAvailable).toBe(false); expect(result.executionAuthorized).toBe(false);
    expect(result.hashCryptographicallyVerified).toBe(false); expect(result.sourceAuthenticityVerified).toBe(false);
    expect(result.semanticInterpretationVerified).toBe(false); expect(result).not.toHaveProperty("operationId");
  });
  it("requires explicit UNKNOWN without promoting it to real/provider proof", () => {
    const input = fixture(); input.provenance = "UNKNOWN";
    expect(inspect(input).provenanceLabel).toBe("UNKNOWN");
  });
  it("copies and recursively freezes returned evidence independently of caller mutation", () => {
    const input = fixture(), result = inspect(input);
    input.sources[0].text = "changed"; input.citations.title.quote = "changed"; input.draft.title = "changed";
    expect(result.evidence.sources[0].text).not.toBe("changed");
    expect(Object.isFrozen(result.evidence.sources[0])).toBe(true);
    expect(Object.isFrozen(result.evidence.citations.title)).toBe(true);
    expect(() => { (result.evidence.draft as { title: string }).title = "changed"; }).toThrow();
  });
  const invalid: [string, (value: Fixture) => unknown][] = [
    ["unknown version", v => ({ ...v, version: "v2" })],
    ["approval enabled", v => ({ ...v, approvalAvailable: true })],
    ["approval absent", v => { const { approvalAvailable: _ignored, ...rest } = v; void _ignored; return rest; }],
    ["unknown provenance", v => ({ ...v, provenance: "REAL" })],
    ["unreviewed external provenance", v => ({ ...v, provenance: "EXTERNAL_PROVIDER" })],
    ["absent provenance", v => { const { provenance: _ignored, ...rest } = v; void _ignored; return rest; }],
    ["unknown authority field", v => ({ ...v, executionAuthorized: true })],
    ["unexpected operation id", v => ({ ...v, operationId: "actionable" })],
    ["only one SMS", v => ({ ...v, sources: v.sources.slice(0, 1) })],
    ["third SMS", v => ({ ...v, sources: [...v.sources, v.sources[0]] })],
    ["swapped sources", v => ({ ...v, sources: [...v.sources].reverse() })],
    ["duplicate identity", v => { v.sources[1].operationId = v.sources[0].operationId; return v; }],
    ["blank source", v => { v.sources[0].text = ""; return v; }],
    ["oversized text", v => { v.sources[0].text = "a".repeat(10_001); return v; }],
    ["malformed hash", v => { v.sources[0].requestHash = "A".repeat(64); return v; }],
    ["citation hash mismatch", v => { v.citations.answer.requestHash = "c".repeat(64); return v; }],
    ["citation source mismatch", v => { v.citations.title.sourceOperationId = "reply"; return v; }],
    ["wrong quote", v => { v.citations.answer.quote = "15h"; return v; }],
    ["negative offset", v => { v.citations.answer.start = -1; return v; }],
    ["noninteger offset", v => { v.citations.answer.start = 0.5; return v; }],
    ["empty range", v => { v.citations.answer.start = 3; return v; }],
    ["range out of bounds", v => { v.citations.answer.end = 4; return v; }],
    ["missing citation", v => { const { answer: _ignored, ...rest } = v.citations; void _ignored; return { ...v, citations: rest }; }],
    ["title not original quote", v => { v.draft.title = "Invented title"; return v; }],
    ["new date anchor", v => { v.anchorReceivedAt = v.sources[1].receivedAt; return v; }],
    ["answer before original", v => { v.sources[1].receivedAt = "2026-09-10T23:57:00.000Z"; return v; }],
    ["answer simultaneous with original", v => { v.sources[1].receivedAt = v.sources[0].receivedAt; return v; }],
    ["nonexistent date", v => { v.draft.startsAt = "2026-02-30T18:00:00.000Z"; return v; }],
    ["nonUTC raw date", v => { v.draft.startsAt = "2026-09-11T14:00:00.000-04:00"; return v; }],
    ["missing date precision", v => { v.sources[1].receivedAt = "2026-09-11T00:02:00Z"; return v; }],
    ["equal interval", v => { v.draft.endsAt = v.draft.startsAt; return v; }],
    ["reversed interval", v => { v.draft.endsAt = "2026-09-11T17:00:00.000Z"; return v; }],
    ["unknown draft field", v => ({ ...v, draft: { ...v.draft, approved: true } })],
    ["unknown slot", v => ({ ...v, clarifiedSlot: "BOTH" })],
  ];
  it.each(invalid)("refuses %s without actionable evidence", (_name, mutate) => {
    const result = personalCorrelatedCalendarPreview(mutate(fixture()));
    expect(result.status).toBe("UNAVAILABLE"); expect(result.approvalAvailable).toBe(false);
    expect(result).not.toHaveProperty("evidence");
  });
  it("rejects a UTF-16 range that cuts the original emoji, even with matching sliced quote", () => {
    const input = fixture(), start = input.sources[0].text.indexOf("🏗");
    input.citations.title = { ...input.citations.title, start, end: start + 1, quote: input.sources[0].text.slice(start, start + 1) };
    input.draft.title = input.citations.title.quote;
    expect(personalCorrelatedCalendarPreview(input).status).toBe("UNAVAILABLE");
  });
  it("preserves the existing trim-only title transformation, not source normalization", () => {
    const input = fixture(); input.sources[0].text = " visite ";
    const cite = { sourceOperationId: "original", requestHash: input.sources[0].requestHash, start: 0, end: 8, quote: " visite " };
    input.citations.title = cite; input.citations.originalStart = cite; input.citations.originalEnd = cite; input.draft.title = "visite";
    const result = inspect(input); expect(result.evidence.sources[0].text).toBe(" visite ");
    // This permissive lexical case is NOT a validated calendar instruction: semantic verification stays false.
    expect(result.semanticInterpretationVerified).toBe(false);
  });
  it.each(["Mars/Colony", " America/Toronto"])("keeps exact raw evidence but marks local rendering unavailable for %s", timezone => {
    const input = fixture(); input.draft.timezone = timezone;
    const result = inspect(input); expect(result.localTimes.status).toBe("UNAVAILABLE");
    expect(result.evidence.draft).toEqual(input.draft); expect(result.approvalAvailable).toBe(false);
  });
  it("handles unavailable Intl without using the phone timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("unsupported"); });
    expect(inspect().localTimes.status).toBe("UNAVAILABLE");
  });
  it("displays exact fall-DST instants with distinct offsets, never resolving ambiguity itself", () => {
    const input = fixture(); input.draft.startsAt = "2026-11-01T05:30:00.000Z"; input.draft.endsAt = "2026-11-01T06:30:00.000Z";
    const result = inspect(); expect(result.approvalAvailable).toBe(false);
    const output = inspect(input).localTimes;
    if (output.status !== "DISPLAYABLE") throw new Error("display unavailable");
    expect(output.start.localTime).toBe(output.end.localTime);
    expect(output.start.utcOffset).toBe("UTC−04:00"); expect(output.end.utcOffset).toBe("UTC−05:00");
  });
  it("does not claim cryptographic verification for a syntactically consistent forged hash", () => {
    const input = fixture(); input.sources[1].requestHash = "c".repeat(64); input.citations.answer.requestHash = "c".repeat(64);
    expect(inspect(input).hashCryptographicallyVerified).toBe(false);
  });
});
