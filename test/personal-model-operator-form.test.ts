import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
const h = vi.hoisted(() => ({ refs: [] as { current: unknown }[], states: [] as unknown[], refIndex: 0, stateIndex: 0,
  effects: [] as { deps: unknown[]; cleanup?: () => void }[], effectIndex: 0, queued: [] as (() => void)[] }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useRef(initial: unknown) { const index = h.refIndex++; return h.refs[index] ?? (h.refs[index] = { current: initial }); },
  useState(initial: unknown) { const index = h.stateIndex++; if (!(index in h.states)) h.states[index] = initial;
    return [h.states[index], (next: unknown) => { h.states[index] = next; }]; },
  useEffect(run: () => (() => void), deps: unknown[]) { const index = h.effectIndex++, prior = h.effects[index];
    if (!prior || deps.some((value, n) => value !== prior.deps[n])) h.queued.push(() => {
      prior?.cleanup?.(); h.effects[index] = { deps, cleanup: run() }; }); },
}));
import { OperatorForm } from "../src/app/personal/model/operator-setup/operator-form";
import { parseOperatorFormView, parseOperatorSetupReceipt, readOperatorSetupReceipt, OPERATOR_FORM_ORIGIN, OPERATOR_FORM_API,
  type OperatorFormView } from "../src/app/personal/model/operator-setup/operator-form-wire";

const setupRef = "12345678-1234-4234-8234-123456789abc", time = "2026-09-11T03:00:00.000Z";
const syntheticKey = "synthetic_form_key_never_valid_123456";
function view(): OperatorFormView { return { version: "personal-model-operator-form-v1", setupRef, provider: "openrouter", model: "synthetic/model",
  providerEndpoint: "synthetic-endpoint", purpose: "personal_intent_candidate_v1", expiresAt: "2026-09-11T03:10:00.000Z",
  state: "INPUT_AVAILABLE", executionAuthorized: false, providerVerified: false }; }
function receipt() { return { version: "personal-model-setup-receipt-v1", status: "APPLIED_NOT_ACTIVATED", setupRef, targetProfile: "PERSONAL_PILOT",
  sourceHead: "a".repeat(40), schemaCatalogSha256: "b".repeat(64), manifestSha256: "c".repeat(64), manifestHash: `sha256:${"d".repeat(64)}`,
  artifactHash: `sha256:${"e".repeat(64)}`, configurationSha256: "f".repeat(64), routeId: "synthetic-route", routeHash: `sha256:${"1".repeat(64)}`,
  policyId: "synthetic-policy", policyHash: `sha256:${"2".repeat(64)}`, publishedAt: time, inspectedAt: time,
  executionAuthorized: false, providerVerified: false, consentCreated: false, runtimeActivated: false, billingSettled: false, automaticRetry: false }; }
type Element = ReactElement<Record<string, unknown>>;
function nodes(raw: unknown): Element[] {
  if (Array.isArray(raw)) return raw.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(raw)) return [];
  return [raw, ...nodes(raw.props.children)];
}
function text(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map(text).join(" ");
  if (isValidElement<Record<string, unknown>>(raw)) return text(raw.props.children);
  return typeof raw === "string" ? raw : "";
}
let tree: unknown, currentView: OperatorFormView, dom: { value: string }, oldRef: ((value: HTMLInputElement | null) => void) | undefined;
let wall: number, mono: number, fetchMock: ReturnType<typeof vi.fn>, events: EventTarget;
function render(effects = true) {
  h.refIndex = h.stateIndex = h.effectIndex = 0; tree = OperatorForm({ view: currentView });
  const input = nodes(tree).find(n => n.type === "input"), next = input?.props.ref as typeof oldRef;
  if (oldRef && oldRef !== next) oldRef(null); if (next) next(dom as HTMLInputElement); oldRef = next;
  if (effects) { const queue = h.queued.splice(0); queue.forEach(run => run()); }
  return tree;
}
const button = () => nodes(tree).find(n => n.type === "button" && n.props.type === "button")!;
function submit() { const form = nodes(tree).find(n => n.type === "form")!;
  (form.props.onSubmit as (e: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() }); }
async function settle() { for (let n = 0; n < 35; n++) await Promise.resolve(); render(); }
function mounted() { render(); render(); }
beforeEach(() => {
  h.refs = []; h.states = []; h.effects = []; h.queued = []; oldRef = undefined; currentView = view(); dom = { value: "" };
  wall = Date.parse(time); mono = 1000; vi.spyOn(Date, "now").mockImplementation(() => wall); vi.spyOn(performance, "now").mockImplementation(() => mono);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  events = Object.assign(new EventTarget(), { location: { origin: OPERATOR_FORM_ORIGIN } }); vi.stubGlobal("window", events);
  fetchMock = vi.fn(async () => Response.json(receipt())); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { h.effects.forEach(e => e.cleanup?.()); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("actual operator component handlers with synthetic React hook/DOM adapters", () => {
  it("renders no secret field before client effects; render never submits or queries", () => {
    render(false); expect(nodes(tree).some(n => n.type === "input")).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
    h.queued.splice(0).forEach(run => run()); render();
    const input = nodes(tree).find(n => n.type === "input")!;
    expect(input.props).toMatchObject({ type: "password", maxLength: 512, autoComplete: "off", spellCheck: false });
    expect(input.props).not.toHaveProperty("name"); expect(input.props).not.toHaveProperty("value"); expect(input.props).not.toHaveProperty("defaultValue");
  });
  it("one click/Enter latch clears input before fetch and sends only the closed command", async () => {
    mounted(); dom.value = syntheticKey; let release!: (r: Response) => void;
    fetchMock.mockImplementation(() => { expect(dom.value).toBe(""); return new Promise<Response>(resolve => { release = resolve; }); });
    submit(); submit(); expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(OPERATOR_FORM_API); expect(options).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error" });
    expect(options.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(options.body)).toEqual({ version: "personal-model-setup-command-v1", setupRef, apiKey: syntheticKey });
    render(); expect(nodes(tree).some(n => n.type === "input")).toBe(false);
    release(Response.json(receipt())); await settle(); expect(text(tree)).toContain("Configuration enregistrée; modèle non activé lors de cette opération.");
    expect(JSON.stringify(h.states)).not.toContain(syntheticKey); expect(JSON.stringify(h.refs)).not.toContain(syntheticKey);
  });
  it("local invalid key is correctable before any dispatch", async () => {
    mounted(); dom.value = "short"; submit(); render(); expect(fetchMock).not.toHaveBeenCalled();
    expect(text(tree)).toContain("Vérifiez le format"); dom.value = syntheticKey; submit(); await settle(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not touch storage, cookies, clipboard or console while submitting a synthetic key", async () => {
    const leak = vi.fn(() => { throw new Error("FORBIDDEN_SINK"); });
    vi.stubGlobal("localStorage", { setItem: leak, getItem: leak }); vi.stubGlobal("sessionStorage", { setItem: leak, getItem: leak });
    vi.stubGlobal("navigator", { clipboard: { writeText: leak, readText: leak } });
    vi.stubGlobal("document", Object.defineProperty({}, "cookie", { get: leak, set: leak }));
    const log = vi.spyOn(console, "log"), error = vi.spyOn(console, "error"), warn = vi.spyOn(console, "warn");
    mounted(); dom.value = syntheticKey; submit(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(leak).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
    expect(text(tree)).not.toContain(syntheticKey); expect(JSON.stringify(h.states)).not.toContain(syntheticKey);
  });
  it.each([400, 401, 403, 404, 413, 429, 503])("HTTP %s never rearms the secret field", async status => {
    mounted(); fetchMock.mockResolvedValue(new Response("UNTRUSTED_ERROR", { status })); dom.value = syntheticKey; submit(); await settle();
    expect(text(tree)).toContain("Résultat non confirmé"); expect(text(tree)).not.toContain("UNTRUSTED_ERROR");
    expect(nodes(tree).some(n => n.type === "input")).toBe(false); render(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("a lost response closes POST and explicit GET carries no secret, even after expiry", async () => {
    mounted(); fetchMock.mockRejectedValueOnce(new Error(syntheticKey)); dom.value = syntheticKey; submit(); await settle();
    wall += 700000; mono += 700000;
    (button().props.onClick as () => void)(); (button().props.onClick as () => void)(); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`${OPERATOR_FORM_API}?setupRef=${setupRef}`);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET", body: undefined });
    expect(nodes(tree).some(n => n.type === "input")).toBe(false);
  });
  it("manual history before POST closes the input and UNKNOWN cannot rearm it", async () => {
    mounted(); dom.value = syntheticKey; fetchMock.mockResolvedValue(new Response("missing", { status: 503 }));
    (button().props.onClick as () => void)(); await settle(); expect(dom.value).toBe("");
    expect(nodes(tree).some(n => n.type === "input")).toBe(false); expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });
  it("pagehide clears pending input, aborts owned work and BFCache never rearms", async () => {
    mounted(); dom.value = syntheticKey; fetchMock.mockImplementation(() => new Promise(() => {})); submit();
    events.dispatchEvent(new Event("pagehide")); await settle(); expect(dom.value).toBe("");
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true); expect(text(tree)).toContain("Rechargez-la");
    const event = Object.assign(new Event("pageshow"), { persisted: true }); events.dispatchEvent(event); render();
    expect(nodes(tree).some(n => n.type === "input")).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("unmount aborts but does not claim a pending server write rolled back", async () => {
    mounted(); fetchMock.mockImplementation(() => new Promise(() => {})); dom.value = syntheticKey; submit();
    const before = [...h.states]; h.effects.forEach(e => e.cleanup?.()); await settle();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true); expect(h.states).toEqual(before);
  });
  it("a changed selector aborts and never promotes a fresh setup on the same mount", async () => {
    mounted(); fetchMock.mockImplementation(() => new Promise(() => {})); dom.value = syntheticKey; submit();
    currentView = { ...view(), setupRef: "12345678-1234-4234-8234-123456789abd" }; render(); await settle();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true); expect(text(tree)).toContain("Rechargez-la"); expect(dom.value).toBe("");
  });
  it.each(["expiry", "backward wall", "backward monotone"])("UI clock %s prevents POST before dispatch", kind => {
    mounted(); dom.value = syntheticKey;
    if (kind === "expiry") wall += 600000; if (kind === "backward wall") wall -= 1; if (kind === "backward monotone") mono -= 1;
    submit(); render(); expect(fetchMock).not.toHaveBeenCalled(); expect(dom.value).toBe(""); expect(nodes(tree).some(n => n.type === "input")).toBe(false);
  });
  it("timer deadline releases a hung fetch as UNKNOWN without retry", async () => {
    mounted(); fetchMock.mockImplementation(() => new Promise(() => {})); dom.value = syntheticKey; submit();
    await vi.advanceTimersByTimeAsync(15000); await settle();
    expect(text(tree)).toContain("Résultat non confirmé"); expect(fetchMock).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("refuses another origin before showing input or fetching", () => {
    Object.assign(events, { location: { origin: "https://foreign.invalid" } }); mounted();
    expect(nodes(tree).some(n => n.type === "input")).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("HISTORY_ONLY does not render a consent control or a secret input", () => {
    currentView = { ...view(), state: "HISTORY_ONLY" }; mounted();
    expect(nodes(tree).some(n => n.type === "input" || n.type === "form")).toBe(false); expect(button().props.disabled).toBe(false);
  });
  it("a malformed or wrong-setup receipt cannot display recorded success", async () => {
    mounted(); fetchMock.mockResolvedValue(Response.json({ ...receipt(), setupRef: "12345678-1234-4234-8234-123456789abd" }));
    dom.value = syntheticKey; submit(); await settle(); expect(text(tree)).toContain("Résultat non confirmé");
    expect(text(tree)).not.toContain("Configuration enregistrée;");
  });
});

describe("browser-only bounded closed wire", () => {
  it("copies only the ten DTO fields and refuses hidden/accessor fields", () => {
    const raw = view(), copy = parseOperatorFormView(raw); expect(copy).toEqual(raw); expect(Object.isFrozen(copy)).toBe(true);
    const getter = vi.fn(() => "synthetic"); Object.defineProperty(raw, "model", { get: getter });
    expect(() => parseOperatorFormView(raw)).toThrow("OPERATOR_FORM_REFUSED"); expect(getter).not.toHaveBeenCalled();
    expect(() => parseOperatorFormView({ ...view(), manifestUtf8: "secret" })).toThrow();
  });
  it("validates the full receipt, not a success status alone", () => {
    expect(parseOperatorSetupReceipt(JSON.stringify(receipt()), setupRef)).toEqual(receipt());
    expect(() => parseOperatorSetupReceipt('{"status":"APPLIED_NOT_ACTIVATED"}', setupRef)).toThrow();
  });
  it.each(["executionAuthorized", "providerVerified", "consentCreated", "runtimeActivated", "billingSettled", "automaticRetry"])
    ("rejects authority flag %s", key => { expect(() => parseOperatorSetupReceipt(JSON.stringify({ ...receipt(), [key]: true }), setupRef)).toThrow(); });
  it("rejects extra secret material, byte overflow and invalid date ordering", () => {
    expect(() => parseOperatorSetupReceipt(JSON.stringify({ ...receipt(), apiKey: syntheticKey }), setupRef)).toThrow();
    expect(() => parseOperatorSetupReceipt(JSON.stringify(receipt()) + " ".repeat(16384), setupRef)).toThrow();
    expect(() => parseOperatorSetupReceipt(JSON.stringify({ ...receipt(), inspectedAt: "2026-09-10T00:00:00Z" }), setupRef)).toThrow();
  });
  it("streaming cap refuses actual oversize independently of Content-Length", async () => {
    const response = new Response(" ".repeat(16385), { headers: { "content-type": "application/json" } });
    await expect(readOperatorSetupReceipt(response, setupRef, new AbortController().signal)).rejects.toThrow("OPERATOR_FORM_REFUSED");
  });
  it("abort cancels a hung response read without waiting for cancellation", async () => {
    const controller = new AbortController(); let cancel = 0;
    const response = new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancel++; return new Promise(() => {}); } }),
      { headers: { "content-type": "application/json" } });
    const pending = readOperatorSetupReceipt(response, setupRef, controller.signal); const assertion = expect(pending).rejects.toThrow();
    controller.abort(); await assertion; expect(cancel).toBeGreaterThan(0);
  });
});
