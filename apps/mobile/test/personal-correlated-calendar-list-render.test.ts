import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalCorrelatedCalendarReviewList } from "../src/components/personal-correlated-calendar-review-list";
import { parsePersonalCorrelatedCalendarList } from "../src/lib/personal-correlated-calendar-list";
import type { CorrelatedListSnapshot } from "../src/lib/personal-correlated-calendar-list-lifecycle";
import { correlatedListFixture, listNow } from "./fixtures/correlated-calendar-list";

const harness = vi.hoisted(() => ({
  session: { activeWorkspace: { id: "workspace", role: "OWNER", defaultLocale: "fr-CA" }, signedIn: true, sessionPending: false, bootstrap: { user: { id: "owner" } } },
  auth: { data: { user: { id: "owner" }, session: { id: "session" } }, isPending: false },
  app: { currentState: "active" }, listeners: new Map<string, (state: string) => void>(), cleanup: [] as (() => void)[],
  snapshot: null as unknown as CorrelatedListSnapshot,
  activate: vi.fn(), pause: vi.fn(), reload: vi.fn(), request: vi.fn(), buttons: [] as { disabled?: boolean; onPress: () => void }[],
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useLayoutEffect: (effect: () => (() => void)) => { harness.cleanup.push(effect()); } };
});
vi.mock("expo-router", () => ({ useFocusEffect: (effect: () => (() => void)) => { harness.cleanup.push(effect()); } }));
vi.mock("react-native", () => ({
  Text: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  View: ({ children }: { children: ReactNode }) => createElement("div", null, children), Platform: { OS: "android" },
  AppState: { get currentState() { return harness.app.currentState; }, addEventListener: (event: string, callback: (state: string) => void) => {
    harness.listeners.set(event, callback); return { remove: () => harness.listeners.delete(event) };
  } },
}));
vi.mock("../src/components/ui", () => ({ Card: "section", Label: "h3", Notice: "aside", sharedStyles: { value: {}, muted: {} },
  Button: ({ children, ...props }: { children: ReactNode; disabled?: boolean; onPress: () => void }) => { harness.buttons.push(props); return createElement("button", { disabled: props.disabled }, children); },
}));
vi.mock("../src/lib/api", () => ({ MobileApi: class { personalCorrelatedCalendarReviews = harness.request; }, MobileApiError: class extends Error {} }));
vi.mock("../src/lib/auth-client", () => ({ authClient: { useSession: () => harness.auth, getCookie: () => "unused" } }));
vi.mock("../src/state/mobile-session", () => ({ useMobileSession: () => harness.session }));
vi.mock("../src/lib/personal-correlated-calendar-list-lifecycle", () => ({ createCorrelatedCalendarListLifecycle: () => ({
  getSnapshot: () => harness.snapshot, subscribe: () => () => undefined, activate: harness.activate, pause: harness.pause, reload: harness.reload,
}) }));
const render = () => renderToStaticMarkup(createElement(PersonalCorrelatedCalendarReviewList, { workspaceId: "workspace" }));
beforeEach(() => {
  vi.restoreAllMocks(); vi.spyOn(Date, "now").mockReturnValue(listNow);
  harness.snapshot = { phase: "READY", data: parsePersonalCorrelatedCalendarList(correlatedListFixture(), "workspace"), readStartedAt: listNow };
  harness.session.activeWorkspace = { id: "workspace", role: "OWNER", defaultLocale: "fr-CA" }; harness.session.signedIn = true; harness.session.sessionPending = false;
  harness.auth.isPending = false; harness.auth.data.user.id = "owner"; harness.auth.data.session.id = "session";
  harness.app.currentState = "active"; harness.listeners.clear(); harness.cleanup = []; harness.buttons = [];
  harness.activate.mockClear(); harness.pause.mockClear(); harness.reload.mockClear(); harness.request.mockClear();
});
describe("actual list render and hook wiring with synthetic hooks, not a native device", () => {
  it("renders frozen cards with two complete texts and only the explicit read refresh button", () => {
    const output = render(); expect(output).toContain(correlatedListFixture().reviews[0].evidence.sources[0].text);
    expect(output).toContain("Ta précision"); expect(output).toContain("14:00 (UTC−04:00)");
    expect(output.match(/<button/gu)).toHaveLength(1); expect(output).toContain("Actualiser cette lecture");
    expect(output).not.toContain("Approuver"); harness.buttons[0].onPress(); expect(harness.reload).toHaveBeenCalledOnce();
  });
  it("hasMore stays a bounded notice without pagination or ids", () => {
    const raw = correlatedListFixture(); raw.hasMore = true;
    harness.snapshot = { phase: "READY", data: parsePersonalCorrelatedCalendarList(raw, "workspace"), readStartedAt: listNow };
    const output = render(); expect(output).toContain("cinq plus récents"); expect(output).not.toContain("synthetic-review"); expect(harness.buttons).toHaveLength(1);
  });
  it.each(["LOADING", "PAUSED", "DISABLED", "UNAVAILABLE", "EXPIRED"] as const)("%s never renders old source text or empty-success copy", phase => {
    harness.snapshot = { phase, data: null, readStartedAt: listNow };
    const output = render(); expect(output).not.toContain("Ajoute visite"); expect(output).not.toContain("Aucun rendez-vous précisé à afficher");
    expect(harness.buttons[0].disabled).toBe(phase === "LOADING" || phase === "PAUSED");
    if (phase === "DISABLED") expect(output).toContain("n’est pas activée");
  });
  it("only successful [] has an empty-result notice", () => {
    const raw = correlatedListFixture(); raw.reviews = [];
    harness.snapshot = { phase: "READY", data: parsePersonalCorrelatedCalendarList(raw, "workspace"), readStartedAt: listNow };
    expect(render()).toContain("Aucun rendez-vous précisé à afficher");
  });
  it("the external store expired snapshot hides cards at render", () => {
    harness.snapshot = { phase: "EXPIRED", data: null, readStartedAt: listNow };
    const output = render(); expect(output).toContain("vérification a expiré"); expect(output).not.toContain("Ajoute visite");
  });
  it.each(["wrong user", "wrong workspace", "not owner", "session pending", "auth pending", "signed out"])("scope refusal %s hides synchronously before child hooks", reason => {
    if (reason === "wrong user") harness.auth.data.user.id = "foreign";
    if (reason === "wrong workspace") harness.session.activeWorkspace.id = "foreign";
    if (reason === "not owner") harness.session.activeWorkspace.role = "FIELD_WORKER";
    if (reason === "session pending") harness.session.sessionPending = true;
    if (reason === "auth pending") harness.auth.isPending = true;
    if (reason === "signed out") harness.session.signedIn = false;
    expect(render()).toBe(""); expect(harness.activate).not.toHaveBeenCalled(); expect(harness.listeners.size).toBe(0);
  });
  it("binds foreground/background, Android blur/focus, route cleanup and layout unmount cleanup", () => {
    render(); expect(harness.activate).toHaveBeenCalledOnce();
    harness.listeners.get("change")!("background"); expect(harness.pause).toHaveBeenCalledOnce();
    harness.listeners.get("change")!("active"); expect(harness.activate).toHaveBeenCalledTimes(2);
    harness.listeners.get("blur")!("active"); expect(harness.pause).toHaveBeenCalledTimes(2);
    harness.app.currentState = "background"; harness.listeners.get("focus")!("active"); expect(harness.activate).toHaveBeenCalledTimes(2);
    harness.cleanup.forEach(cleanup => cleanup()); expect(harness.listeners.size).toBe(0); expect(harness.pause).toHaveBeenCalledTimes(5);
  });
  it("inactive initial app does not activate a read", () => {
    harness.app.currentState = "background"; render(); expect(harness.activate).not.toHaveBeenCalled(); expect(harness.pause).toHaveBeenCalledOnce();
  });
  it("uses workspace English locale for list and immutable cards", () => {
    harness.session.activeWorkspace.defaultLocale = "en-CA";
    const output = render(); expect(output).toContain("Appointments clarified by SMS"); expect(output).toContain("Your original request"); expect(output).toContain("Refresh this review");
  });
});
