import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalCorrelatedCalendarApproval } from "../src/components/personal-correlated-calendar-approval";
import { parsePersonalCorrelatedCalendarApprovalOffer } from "../src/lib/personal-correlated-calendar-approval";
import type { CorrelatedApprovalSnapshot } from "../src/lib/personal-correlated-calendar-approval-lifecycle";
import { approvalOfferFixture, approvalResponseFixture, approvalHistoryFixture, approvalCommandFixture } from "./fixtures/correlated-calendar-approval";

const h = vi.hoisted(() => ({
  session: { activeWorkspace: { id: "workspace", role: "OWNER", defaultLocale: "fr-CA" }, signedIn: true, sessionPending: false, bootstrap: { user: { id: "owner" } } },
  auth: { data: { user: { id: "owner" }, session: { id: "session" } }, isPending: false },
  app: { currentState: "active" }, origin: "https://synthetic.invalid", cleanup: [] as (() => void)[], listeners: new Map<string, (value: string) => void>(),
  snapshot: null as unknown as CorrelatedApprovalSnapshot, buttons: [] as { text: string; disabled?: boolean; onPress: () => void }[],
  activate: vi.fn(), pause: vi.fn(), select: vi.fn(), send: vi.fn(), history: vi.fn(), dismiss: vi.fn(), factory: vi.fn(), registry: vi.fn(), constructor: vi.fn(),
  showListCard: true, offeredReview: null as unknown,
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useLayoutEffect: (run: () => (() => void)) => { h.cleanup.push(run()); } }));
vi.mock("expo-router", () => ({ useFocusEffect: (run: () => (() => void)) => { h.cleanup.push(run()); } }));
vi.mock("react-native", () => ({ Platform: { OS: "android" }, Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children), AppState: { get currentState() { return h.app.currentState; },
    addEventListener: (event: string, callback: (value: string) => void) => { h.listeners.set(event, callback); return { remove: () => h.listeners.delete(event) }; } } }));
vi.mock("../src/components/ui", () => ({ Card: "section", Label: "h3", Notice: "aside", sharedStyles: { muted: {}, value: {} },
  Button: ({ children, disabled, onPress }: { children: ReactNode; disabled?: boolean; onPress: () => void }) => {
    h.buttons.push({ text: String(children), disabled, onPress }); return createElement("button", { disabled }, children);
  } }));
vi.mock("../src/components/personal-correlated-calendar-review-list", () => ({ PersonalCorrelatedCalendarReviewList: ({ renderReviewControls }: { renderReviewControls?: (review: unknown) => ReactNode }) =>
  createElement("section", { "data-existing-list": true }, h.showListCard ? renderReviewControls?.(h.offeredReview) : null) }));
vi.mock("../src/lib/api", () => ({ MobileApi: class { constructor(options: unknown) { h.constructor(options); } } }));
vi.mock("../src/lib/config", () => ({ mobileApiBaseUrl: () => { if (!h.origin) throw new Error("UNCONFIGURED"); return h.origin; } }));
vi.mock("../src/lib/auth-client", () => ({ authClient: { useSession: () => h.auth, getCookie: () => "unused" } }));
vi.mock("../src/state/mobile-session", () => ({ useMobileSession: () => h.session }));
vi.mock("../src/lib/personal-correlated-calendar-approval-attempts", () => ({ createCorrelatedCalendarApprovalAttempts: (input: unknown) => { h.registry(input); return {}; } }));
vi.mock("../src/lib/personal-correlated-calendar-approval-lifecycle", () => ({ createCorrelatedCalendarApprovalLifecycle: (input: unknown) => { h.factory(input); return {
  subscribe: () => () => undefined, getSnapshot: () => h.snapshot, activate: h.activate, pause: h.pause, select: h.select, send: h.send, history: h.history, dismiss: h.dismiss,
}; } }));
const render = () => renderToStaticMarkup(createElement(PersonalCorrelatedCalendarApproval, { workspaceId: "workspace" }));
const button = (text: string) => h.buttons.find(b => b.text === text)!;
beforeEach(() => {
  vi.clearAllMocks(); h.cleanup = []; h.listeners.clear(); h.buttons = []; h.app.currentState = "active"; h.origin = "https://synthetic.invalid"; h.showListCard = true;
  h.session.activeWorkspace = { id: "workspace", role: "OWNER", defaultLocale: "fr-CA" }; h.session.signedIn = true; h.session.sessionPending = false;
  h.auth.data.user.id = "owner"; h.auth.data.session.id = "session"; h.auth.isPending = false;
  const offer = parsePersonalCorrelatedCalendarApprovalOffer(approvalOfferFixture(), "workspace", "review"); h.offeredReview = offer.review;
  h.snapshot = Object.freeze({ phase: "OFFER", selectedReviewId: "review", offer, result: null, markers: [], capacityBlocked: false });
});
afterEach(() => { h.cleanup.forEach(cleanup => cleanup?.()); });

describe("controller actual approval component/card render with synthetic hook/state adapters", () => {
  it("shows both exact offered SMS before a separate explicit action and sends nothing on render", () => {
    const output = render(), sources = h.snapshot.offer!.review.evidence.sources;
    expect(output).toContain(sources[0].text); expect(output).toContain(sources[1].text);
    expect(output.indexOf(sources[0].text)).toBeLessThan(output.indexOf("Ajouter cet événement exact"));
    expect(output).toContain("Version exacte à approuver"); expect(output).toContain("Le bouton suivant approuve seulement cette version");
    expect(h.send).not.toHaveBeenCalled(); expect(h.select).not.toHaveBeenCalled();
    button("Vérifier cet ajout").onPress(); expect(h.select).toHaveBeenCalledWith("review"); expect(h.send).not.toHaveBeenCalled();
    expect(button("Ajouter cet événement exact à Google Agenda").disabled).toBe(false);
    button("Ajouter cet événement exact à Google Agenda").onPress(); expect(h.send).toHaveBeenCalledOnce();
  });
  it.each(["PAUSED", "LOADING", "SENDING"] as const)("disables selection/history/action during %s", phase => {
    h.snapshot = { ...h.snapshot, phase }; render();
    expect(button("Vérifier cet ajout").disabled).toBe(true); expect(button("Vérifier le résultat enregistré").disabled).toBe(true);
    expect(button("Ajouter cet événement exact à Google Agenda").disabled).toBe(true);
  });
  it.each(["UNKNOWN", "EXPIRED"] as const)("keeps metadata history reachable without expired list/card in %s", phase => {
    h.showListCard = false; h.snapshot = { ...h.snapshot, phase, offer: null, markers: [{ ...approvalCommandFixture(), fingerprintVersion: "personal-correlated-calendar-approval-view-v1", state: "ATTEMPT_RESERVED" }] };
    const output = render(); expect(output).not.toContain(approvalOfferFixture().review.evidence.sources[0].text);
    expect(output).not.toContain("Ajouter cet événement exact"); expect(output).toContain("Tentatives conservées");
    expect(output).not.toContain('"expectedRequestHash"'); expect(output).not.toContain("a".repeat(64));
    button("Vérifier la tentative enregistrée 1").onPress(); expect(h.history).toHaveBeenCalledWith("review"); expect(h.send).not.toHaveBeenCalled();
  });
  it("saturated storage blocks new choice but not historical result checks", () => {
    h.snapshot = { ...h.snapshot, phase: "UNAVAILABLE", offer: null, capacityBlocked: true }; render();
    expect(button("Vérifier cet ajout").disabled).toBe(true); expect(button("Vérifier le résultat enregistré").disabled).toBe(false);
    button("Vérifier le résultat enregistré").onPress(); expect(h.history).toHaveBeenCalledOnce();
  });
  it("POST confirmation is recorded proof, not present Google state or immediate dismissal", () => {
    h.snapshot = { ...h.snapshot, phase: "RESULT", offer: null, result: approvalResponseFixture() as CorrelatedApprovalSnapshot["result"] };
    const output = render(); expect(output).toContain("confirmation de cet ajout est enregistrée"); expect(output).toContain("ne vérifie pas l’état actuel");
    expect(button("Retirer ce suivi local confirmé")).toBeUndefined(); expect(h.send).not.toHaveBeenCalled();
  });
  it("only a historical confirmed view exposes explicit local dismissal", () => {
    h.snapshot = { ...h.snapshot, phase: "RESULT", offer: null, result: { ...approvalHistoryFixture(), outcome: "CONFIRMED", approvedAt: "2026-09-11T04:01:00.000Z",
      confirmationBasis: "DURABLE_RECORDED_RESULT", receipt: { confirmed: true, providerEventId: "e" + "a".repeat(31) } } as CorrelatedApprovalSnapshot["result"] };
    render(); button("Retirer ce suivi local confirmé").onPress(); expect(h.dismiss).toHaveBeenCalledWith("review"); expect(h.send).not.toHaveBeenCalled();
  });
  it.each(["wrong owner", "wrong workspace", "field worker", "session pending", "auth pending", "signed out"])("%s hides before creating any child API/registry/lifecycle", kind => {
    if (kind === "wrong owner") h.auth.data.user.id = "foreign"; if (kind === "wrong workspace") h.session.activeWorkspace.id = "foreign";
    if (kind === "field worker") h.session.activeWorkspace.role = "FIELD_WORKER"; if (kind === "session pending") h.session.sessionPending = true;
    if (kind === "auth pending") h.auth.isPending = true; if (kind === "signed out") h.session.signedIn = false;
    expect(render()).toBe(""); expect(h.factory).not.toHaveBeenCalled(); expect(h.registry).not.toHaveBeenCalled(); expect(h.constructor).not.toHaveBeenCalled();
  });
  it("unconfigured origin retains ordinary read-only list with no approval controls", () => {
    h.origin = ""; const output = render(); expect(output).toContain("data-existing-list"); expect(h.buttons).toHaveLength(0); expect(h.factory).not.toHaveBeenCalled();
  });
  it("binds the same origin to HTTP and metadata and fences Android background/blur/focus", () => {
    render(); expect(h.constructor.mock.calls[0][0]).toMatchObject({ baseUrl: h.origin }); expect(h.registry).toHaveBeenCalledWith({ ownerId: "owner", apiOrigin: h.origin });
    const scope = h.factory.mock.calls[0][0].isCurrentScope; expect(scope()).toBe(true); expect(h.activate).toHaveBeenCalledOnce();
    h.listeners.get("change")!("background"); expect(scope()).toBe(false); expect(h.pause).toHaveBeenCalledOnce();
    h.listeners.get("change")!("active"); expect(scope()).toBe(true); h.listeners.get("blur")!(""); expect(scope()).toBe(false);
    h.app.currentState = "background"; h.listeners.get("focus")!(""); expect(scope()).toBe(false);
  });
  it("renders English action and recorded-result guidance without translating source evidence", () => {
    h.session.activeWorkspace.defaultLocale = "en-CA"; const output = render(); expect(output).toContain("Add this exact event to Google Calendar");
    expect(output).toContain("Your original request"); expect(output).toContain(approvalOfferFixture().review.evidence.sources[0].text);
  });
});
