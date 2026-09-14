import { describe, expect, it } from "vitest";
import { createPersonalIntentInput, inspectPersonalIntentCandidate } from "@/server/model-gateway/personal-intent/contract";

const source = "Hey, demain j’ai quoi dans mon agenda?";
const input = () => createPersonalIntentInput("syn-inbound-1", source);
const span = (text = source, quote = "demain") => ({ start: text.indexOf(quote), end: text.indexOf(quote) + quote.length, quote });
const proposal = () => ({ schemaVersion: 1, requestFingerprint: input().requestFingerprint, actions: [{ id: "a1", kind: "READ_CALENDAR", period: span(), dependsOn: [] }] });
const inspect = (value: unknown, request = input()) => inspectPersonalIntentCandidate(JSON.stringify(value), request);

describe("personal model candidate is evidence-bound, never action authority", () => {
  it("accepts Quebec phrasing as a proposal only", () => {
    expect(inspect(proposal())).toMatchObject({ status: "PROPOSAL_INSPECTED_NOT_AUTHORIZED", executionAuthorized: false, preview: null });
  });
  it.each(["approved", "execute", "recipient", "workspaceId", "toolCalls"])("refuses model-added %s authority", key => {
    expect(() => inspect({ ...proposal(), [key]: true })).toThrow();
  });
  it("refuses a replay attached to another canonical inbound operation", () => {
    expect(() => inspect(proposal(), createPersonalIntentInput("syn-inbound-2", source))).toThrow("PERSONAL_INTENT_REQUEST_MISMATCH");
  });
  it("refuses a changed source with the old fingerprint", () => {
    expect(() => inspect(proposal(), createPersonalIntentInput("syn-inbound-1", source.replace("demain", "lundi")))).toThrow("PERSONAL_INTENT_REQUEST_MISMATCH");
  });
  it("refuses fabricated quotation spans and realigns a unique exact quote", () => {
    const p = proposal(); p.actions[0].period.quote = "lundi";
    expect(() => inspect(p)).toThrow("PERSONAL_INTENT_SOURCE_SPAN_MISMATCH");
    p.actions[0].period = { ...span(), start: 0 };
    expect(inspect(p).proposal.actions[0]).toMatchObject({
      period: span(),
    });
  });
  it("refuses to guess when an exact quote occurs more than once", () => {
    const repeated = "demain puis demain";
    const request = createPersonalIntentInput("syn-repeated", repeated);
    const value = { schemaVersion: 1, requestFingerprint: request.requestFingerprint,
      actions: [{ id: "a1", kind: "READ_CALENDAR", period: { start: 1, end: 2, quote: "demain" }, dependsOn: [] }] };
    expect(() => inspect(value, request)).toThrow("PERSONAL_INTENT_SOURCE_SPAN_MISMATCH");
  });
  it("realigns the exact unique fields from the observed 18:30 calendar command", () => {
    const text = "Ajoute à mon calendrier, demain à 18:30, un rendez-vous d'une heure avec Marc au Randolph";
    const request = createPersonalIntentInput("observed-owner-sms", text);
    const value = { schemaVersion: 1, requestFingerprint: request.requestFingerprint,
      actions: [{ id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [],
        title: { start: 0, end: 1, quote: "un rendez-vous d'une heure avec Marc au Randolph" },
        starts: { start: 0, end: 1, quote: "demain à 18:30" },
        ends: { start: 0, end: 1, quote: "d'une heure" } }] };
    const inspected = inspect(value, request).proposal.actions[0];
    expect(inspected).toMatchObject({
      title: span(text, "un rendez-vous d'une heure avec Marc au Randolph"),
      starts: span(text, "demain à 18:30"),
      ends: span(text, "d'une heure"),
    });
  });
  it("refuses fabricated target numbers, even for a self-SMS proposal", () => {
    const p = { ...proposal(), actions: [{ id: "a1", kind: "PREPARE_SELF_SMS", message: span(), to: "+15555550101", dependsOn: [] }] };
    expect(() => inspect(p)).toThrow();
  });
  it("leaves ambiguous times unresolved and requires quoted event fields", () => {
    const text = "Ajoute chantier demain à 7 jusqu’à 8";
    const request = createPersonalIntentInput("syn-ambiguous", text);
    const value = { schemaVersion: 1, requestFingerprint: request.requestFingerprint, actions: [{ id: "a1", kind: "PREPARE_CALENDAR_EVENT", title: span(text, "chantier"), starts: span(text, "demain à 7"), ends: span(text, "8"), dependsOn: [] }] };
    expect(inspect(value, request)).toMatchObject({ executionAuthorized: false, preview: null });
    expect(() => inspect({ ...value, actions: [{ ...value.actions[0], startsAt: "2026-09-10T07:00:00Z" }] }, request)).toThrow();
  });
  it("refuses duplicate IDs, forward references and cyclic dependencies", () => {
    const a = proposal().actions[0];
    expect(() => inspect({ ...proposal(), actions: [a, a] })).toThrow("PERSONAL_INTENT_ACTION_ORDER_INVALID");
    expect(() => inspect({ ...proposal(), actions: [{ ...a, dependsOn: ["a2"] }, { ...a, id: "a2", dependsOn: ["a1"] }] })).toThrow("PERSONAL_INTENT_ACTION_ORDER_INVALID");
  });
  it("refuses more than ten work units and duplicate dependency references", () => {
    const a = proposal().actions[0];
    expect(() => inspect({ ...proposal(), actions: Array.from({ length: 11 }, (_, i) => ({ ...a, id: `a${i}` })) })).toThrow();
    expect(() => inspect({ ...proposal(), actions: [a, { ...a, id: "a2", dependsOn: ["a1", "a1"] }] })).toThrow("PERSONAL_INTENT_ACTION_ORDER_INVALID");
  });
  it("uses closed clarification reasons instead of model claims of success", () => {
    const p = { ...proposal(), actions: [{ id: "a1", kind: "CLARIFY", reason: "AMBIGUOUS_TIME", dependsOn: [] }] };
    expect(inspect(p).executionAuthorized).toBe(false);
    expect(() => inspect({ ...p, actions: [{ ...p.actions[0], reason: "ALREADY_SENT" }] })).toThrow();
  });
  it("rejects over-limit JSON, input and invalid unicode without truncation", () => {
    expect(() => inspectPersonalIntentCandidate(" ".repeat(65_537), input())).toThrow("PERSONAL_INTENT_RESPONSE_LIMIT");
    expect(() => createPersonalIntentInput("syn", "a".repeat(10_001))).toThrow();
    expect(() => createPersonalIntentInput("syn", "\ud800")).toThrow();
  });
  it("does not trust a caller-mutated request fingerprint", () => {
    expect(() => inspect(proposal(), { ...input(), source: "Texte Marc" })).toThrow("PERSONAL_INTENT_INPUT_TAMPERED");
  });
});
