import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePersonalCorrelatedCalendarReview } from "../src/lib/personal-correlated-calendar-review";
import { PersonalCorrelatedCalendarReviewCard } from "../src/components/personal-correlated-calendar-review-card";

vi.mock("react-native", () => ({
  Text: ({ children, selectable }: { children: ReactNode; selectable?: boolean }) => createElement("span", { "data-selectable": selectable ? "true" : undefined }, children),
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("../src/components/ui", () => ({ Card: "section", Label: "h3", Notice: "aside", sharedStyles: { value: {}, muted: {} } }));

function fixture() {
  const source = { role: "ORIGINAL_REQUEST", operationId: "original", requestHash: "a".repeat(64),
    text: "Ajoute inspection 🛠️ demain à 2h, fin 15h.", receivedAt: "2026-09-11T03:58:00.000Z" };
  const answer = { role: "CLARIFICATION_REPLY", operationId: "answer", requestHash: "b".repeat(64), text: "14h", receivedAt: "2026-09-11T04:01:00.000Z" };
  const cite = (src: typeof source, quote: string) => ({ sourceOperationId: src.operationId, requestHash: src.requestHash,
    start: src.text.indexOf(quote), end: src.text.indexOf(quote) + quote.length, quote });
  return { version: "personal-correlated-calendar-review-v1", reviewId: "synthetic-review",
    inspectedAt: "2026-09-11T04:02:00.000Z", preparedAt: "2026-09-11T04:01:03.000Z", preparationExpiresAt: "2026-09-11T04:08:00.000Z",
    currentStatus: "pending", readOnly: true, approvalAvailable: false, executionAuthorized: false, semanticInterpretationVerified: false,
    evidence: { version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "UNKNOWN", sources: [source, answer],
      anchorReceivedAt: source.receivedAt, clarifiedSlot: "START",
      citations: { title: cite(source, "inspection 🛠️"), originalStart: cite(source, "demain à 2h"), originalEnd: cite(source, "15h"), answer: cite(answer, "14h") },
      draft: { title: "inspection 🛠️", startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T19:00:00.000Z", timezone: "America/Toronto" } } };
}
type Fixture = ReturnType<typeof fixture>;
const render = (entry: unknown = fixture(), locale: "fr-CA" | "en-CA" = "fr-CA") => renderToStaticMarkup(createElement(PersonalCorrelatedCalendarReviewCard, { entry, locale }));
afterEach(() => vi.restoreAllMocks());

describe("strict standalone correlated calendar review parser", () => {
  it("accepts exact agreed DTO without server wrapper fields and freezes a detached copy", () => {
    const input = fixture(), result = parsePersonalCorrelatedCalendarReview(input);
    expect(result).toEqual(input); expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evidence.sources[0])).toBe(true);
    input.evidence.sources[0].text = "changed"; input.currentStatus = "completed";
    expect(result.evidence.sources[0].text).not.toBe("changed"); expect(result.currentStatus).toBe("pending");
    expect(() => { (result as { approvalAvailable: boolean }).approvalAvailable = true; }).toThrow();
  });
  it("allows equal prepared and inspected times without consulting the phone clock", () => {
    vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("phone clock unavailable"); });
    const input = fixture(); input.inspectedAt = input.preparedAt;
    expect(parsePersonalCorrelatedCalendarReview(input).inspectedAt).toBe(input.preparedAt);
  });
  const invalid: [string, (value: Fixture) => unknown][] = [
    ["version", v => ({ ...v, version: "v2" })],
    ["missing evidence", v => { const { evidence: _ignored, ...rest } = v; void _ignored; return rest; }],
    ["wrapper committed", v => ({ ...v, committed: true })],
    ["calendar operation ID", v => ({ ...v, calendarOperationId: "effect-target" })],
    ["action callback", v => ({ ...v, onApprove: () => undefined })],
    ["non read-only", v => ({ ...v, readOnly: false })],
    ["approval enabled", v => ({ ...v, approvalAvailable: true })],
    ["execution enabled", v => ({ ...v, executionAuthorized: true })],
    ["semantic certified", v => ({ ...v, semanticInterpretationVerified: true })],
    ["unknown status", v => ({ ...v, currentStatus: "approved" })],
    ["blank ID", v => ({ ...v, reviewId: " " })],
    ["invalid UTC date", v => ({ ...v, inspectedAt: "2026-02-30T04:02:00.000Z" })],
    ["noncanonical date", v => ({ ...v, inspectedAt: "2026-09-11T04:02:00Z" })],
    ["offset date", v => ({ ...v, inspectedAt: "2026-09-11T00:02:00.000-04:00" })],
    ["prepared before answer", v => ({ ...v, preparedAt: "2026-09-11T04:00:59.000Z" })],
    ["inspected before prepared", v => ({ ...v, inspectedAt: "2026-09-11T04:01:02.000Z" })],
    ["inspection at expiry", v => ({ ...v, inspectedAt: v.preparationExpiresAt })],
    ["inspection after expiry", v => ({ ...v, inspectedAt: "2026-09-11T04:08:01.000Z" })],
    ["different source quote", v => { v.evidence.citations.answer.quote = "15h"; return v; }],
    ["duplicate source", v => { v.evidence.sources[1].operationId = v.evidence.sources[0].operationId; return v; }],
    ["nested approval enabled", v => { v.evidence.approvalAvailable = true; return v; }],
    ["unknown provenance", v => { v.evidence.provenance = "LIVE"; return v; }],
  ];
  it.each(invalid)("refuses %s", (_name, mutate) => expect(() => parsePersonalCorrelatedCalendarReview(mutate(fixture()))).toThrow());
});

describe("autonomous read-only correlated calendar card", () => {
  it("shows both FULL SMS messages in order, then exact draft and explicit timezone dates", () => {
    const input = fixture(), output = render(input);
    expect(output).toContain(input.evidence.sources[0].text);
    expect(output).toContain("Ta demande initiale"); expect(output).toContain("Ta précision");
    expect(output.indexOf(input.evidence.sources[0].text)).toBeLessThan(output.indexOf("Ta précision"));
    expect(output.indexOf("Ta précision")).toBeLessThan(output.indexOf("Valeurs exactes du rendez-vous proposé"));
    expect(output).toContain("14:00 (UTC−04:00)"); expect(output).toContain("15:00 (UTC−04:00)");
    expect(output).not.toContain("14:00:00.000"); expect(output).toContain(input.evidence.draft.startsAt);
    expect(output).toContain(input.evidence.draft.endsAt); expect(output).toContain("America/Toronto");
    expect(output).toContain(input.preparedAt); expect(output).toContain(input.inspectedAt); expect(output).toContain(input.preparationExpiresAt);
    expect(output).not.toContain(input.reviewId); expect(output).not.toContain('role="button"'); expect(output).not.toContain("<button");
    expect(output).toContain("lecture seulement"); expect(output).toContain("pas encore ajouté");
  });
  it("shows plain-language provenance without certifying a real run or exposing enum jargon", () => {
    expect(render()).toContain("Origine non vérifiée"); expect(render()).not.toContain("UNKNOWN");
    const input = fixture(); input.evidence.provenance = "SYNTHETIC_LOCAL";
    const output = render(input); expect(output).toContain("Exemple de test — données synthétiques"); expect(output).not.toContain("SYNTHETIC_LOCAL");
    expect(render(input, "en-CA")).toContain("Test example — synthetic data");
    expect(render(fixture(), "en-CA")).toContain("Origin not verified");
  });
  it("keeps one read-only notice and avoids repeating the initial receipt as an anchor", () => {
    const input = fixture(), output = render(input);
    expect(output.match(/<aside>/gu)).toHaveLength(1);
    expect(output.split(input.evidence.anchorReceivedAt)).toHaveLength(2);
    expect(output).not.toContain("Ancre");
  });
  it.each(["processing", "completed", "uncertain", "refused"])("does not label %s as pending or a confirmed Google addition", currentStatus => {
    const input = fixture(); input.currentStatus = currentStatus;
    const output = render(input); expect(output).not.toContain("pas encore ajouté"); expect(output).not.toContain("Ajout Google confirmé");
    expect(output).not.toContain("<button"); expect(output).toContain("Aucune approbation ni action");
    if (currentStatus === "completed") expect(output).toContain("Cette vue ne confirme pas l’ajout à Google Agenda");
  });
  it("English labels preserve full texts and exact raw values", () => {
    const input = fixture(); const output = render(input, "en-CA");
    expect(output).toContain("Your original request"); expect(output).toContain("Your clarification");
    expect(output).toContain("Draft pending — not yet added"); expect(output).toContain(input.evidence.sources[0].text);
    expect(output).toContain("14:00 (UTC−04:00)"); expect(output).toContain(input.evidence.draft.startsAt);
  });
  it("shows the clarified END slot without inventing a new source", () => {
    const input = fixture(); input.evidence.clarifiedSlot = "END";
    expect(render(input)).toContain("La précision porte sur l’heure de fin.");
  });
  it("invalid entry displays only unavailability, not unverified text or raw target data", () => {
    const input = fixture(); input.approvalAvailable = true;
    const output = render(input); expect(output).toContain("Lecture du rendez-vous indisponible");
    expect(output).not.toContain(input.evidence.sources[0].text); expect(output).not.toContain(input.evidence.draft.startsAt);
    expect(render(null, "en-CA")).toContain("Calendar review unavailable");
  });
  it("retains raw evidence under invalid timezone without a phone-zone fallback", () => {
    const input = fixture(); input.evidence.draft.timezone = "Mars/Colony";
    const output = render(input); expect(output).toContain("Heures locales indisponibles");
    expect(output).toContain("Mars/Colony"); expect(output).toContain(input.evidence.draft.startsAt);
  });
  it("retains raw evidence when Intl is unavailable", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("unsupported"); });
    const output = render(); expect(output).toContain("Heures locales indisponibles"); expect(output).toContain(fixture().evidence.draft.startsAt);
  });
  it("renders source markup as text rather than executable HTML", () => {
    const input = fixture(); input.evidence.sources[0].text += " <script>alert(1)</script>";
    const output = render(input); expect(output).toContain("&lt;script&gt;"); expect(output).not.toContain("<script>");
  });
});
