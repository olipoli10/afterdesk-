import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, isValidElement, type ReactElement } from "react";
import { OperatorForm } from "../src/app/personal/model/operator-setup/operator-form";
import { parseOperatorSetupReceipt, parseOperatorFormView, readOperatorSetupReceipt } from "../src/app/personal/model/operator-setup/operator-form-wire";
import { preparePersonalModelOperatorArtifact } from "../src/server/model-gateway/personal-intent/operator-preparation";
import { buildPersonalModelSetupClaim, buildPersonalModelSetupApplied, inspectPersonalModelSetupApplied } from "../src/server/model-gateway/personal-intent/operator-ingress-contract";

const hooks = vi.hoisted(() => ({ enabled: false, refs: [] as { current: unknown }[], values: [] as unknown[],
  effects: [] as { run: () => (() => void); deps: unknown[]; cleanup?: () => void }[], queued: [] as (() => void)[], r: 0, s: 0, e: 0 }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return { ...actual,
    useRef(value: unknown) { if (!hooks.enabled) return actual.useRef(value); const n = hooks.r++; return hooks.refs[n] ?? (hooks.refs[n] = { current: value }); },
    useState(value: unknown) { if (!hooks.enabled) return actual.useState(value); const n = hooks.s++;
      if (!(n in hooks.values)) hooks.values[n] = value; return [hooks.values[n], (next: unknown) => { hooks.values[n] = next; }]; },
    useEffect(run: () => (() => void), deps: unknown[]) {
      if (!hooks.enabled) return actual.useEffect(run, deps); const n = hooks.e++, prior = hooks.effects[n];
      if (!prior || deps.some((v, i) => v !== prior.deps[i])) hooks.queued.push(() => {
        prior?.cleanup?.(); hooks.effects[n] = { run, deps, cleanup: run() };
      });
    },
  };
});
afterEach(() => { hooks.effects.forEach(e => e.cleanup?.()); hooks.enabled = false;
  hooks.refs = []; hooks.values = []; hooks.effects = []; hooks.queued = [];
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const time = "2026-09-11T03:00:00.000Z", instant = Date.parse(time), iso = (n: number) => new Date(n).toISOString();
const setupRef = "12345678-1234-4234-8234-123456789abc";

// Real pure artifact -> full manifest -> B1 claim/applied producer. No core, SQL,
// real review, key, provider or COMMIT is implied by this wire-parity fixture.
function realReceipt(idLength = 32) {
  const authorityId = "ENDVERA-PERSONAL-20260910-100CAD", pilotExpiresAt = "2026-10-10T01:18:26Z";
  const proof = { reviewRef: "SYNTHETIC_NOT_VERIFIED", contentHash: `sha256:${"a".repeat(64)}` };
  const rates = { authorityId, model: "synthetic/model", providerEndpoint: "synthetic-endpoint", reviewedAt: time,
    totalContextTokens: 32768, maxOutputTokens: 512, inputUsdMicrosPerMillionTokens: 1000000, outputUsdMicrosPerMillionTokens: 2000000,
    additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1500000, headroomBasisPoints: 1000, ceilingCadMicros: 20000000, perCallCeilingCadMicros: 100000 };
  const artifact = preparePersonalModelOperatorArtifact({ enabled: true, configuration: {
    operatorReview: { reviewerRef: "SYNTHETIC", reviewedAt: time, rates: proof, fxAndFees: proof, privacy: proof, totalEnvelope: proof },
    pilotContext: { authorityId, expiresAt: pilotExpiresAt }, rateConfiguration: rates,
    pilotEnvelopeReview: { authorityId, reviewRef: "SYNTHETIC", reviewedAt: time, nonModelExposureCeilingCadMicros: 80000000, totalCeilingCadMicros: 100000000 },
    privacyEvidence: { adapterKey: "openrouter-personal-intent-candidate", allowedDataClasses: ["personal_data"], billingProvider: "openrouter",
      certificationOwner: "SYNTHETIC", effectiveAt: time, expiresAt: iso(instant + 600000), endpointKey: rates.providerEndpoint,
      intermediary: "openrouter", modelKey: rates.model, operationTypes: ["personal_intent_candidate_v1"], pathKind: "gateway_mediated",
      privacyPosture: "zero_retention", residency: ["synthetic-region"], tenancyMode: "route_isolated" },
    route: { id: "r".repeat(idLength), version: 1, residency: ["synthetic-region"], maxInputTokens: 32768 },
    policy: { id: "p".repeat(idLength), version: 1 },
  } }, new Date(time));
  expect(artifact.status).toBe("PREPARED_NOT_PUBLISHED");
  if (artifact.status !== "PREPARED_NOT_PUBLISHED") throw new Error("SYNTHETIC_PRODUCER_FAILED");
  const manifest = { version: "personal-model-operator-setup-v1", setupId: setupRef, expectedHead: "b".repeat(40),
    expectedSchemaCatalogSha256: "c".repeat(64), authorityId, pilotExpiresAt, workspaceId: "synthetic-workspace", ownerUserId: "synthetic-owner", artifact };
  const manifestUtf8 = JSON.stringify(manifest), configuration = JSON.stringify({ version: "personal-model-operator-ingress-configuration-v1",
    mode: "ENABLED", setupRef, notBefore: time, expiresAt: iso(instant + 600000), manifestUtf8,
    manifestSha256: createHash("sha256").update(manifestUtf8).digest("hex"), expectedSourceHead: manifest.expectedHead,
    expectedSchemaCatalogSha256: manifest.expectedSchemaCatalogSha256, controllerReceiptRef: "SYNTHETIC", targetProfile: "PERSONAL_PILOT" });
  const claim = buildPersonalModelSetupClaim(configuration, time);
  const applied = buildPersonalModelSetupApplied(configuration, claim, { publishedAt: time, inspectedAt: time });
  expect(inspectPersonalModelSetupApplied(configuration, claim, applied)).toEqual(applied);
  return applied.metadata.receipt;
}
function view() { return parseOperatorFormView({ version: "personal-model-operator-form-v1", setupRef, provider: "openrouter",
  model: "synthetic/model", providerEndpoint: "synthetic-endpoint", purpose: "personal_intent_candidate_v1", expiresAt: iso(instant + 600000),
  state: "INPUT_AVAILABLE", executionAuthorized: false, providerVerified: false }); }

describe("independent B4 wire and render review, pure synthetic producer parity", () => {
  it.each([32, 160, 161, 191])("accepts the actual B1 producer's legal %s-character route/policy IDs", length => {
    const receipt = realReceipt(length);
    expect(receipt.routeId).toHaveLength(length); expect(receipt.policyId).toHaveLength(length);
    expect(parseOperatorSetupReceipt(JSON.stringify(receipt), setupRef)).toEqual(receipt);
  });
  it("rejects malformed identifiers even when all other real receipt fields match", () => {
    const receipt = realReceipt();
    for (const bad of ["a/b", "a b", "x".repeat(192)]) {
      expect(() => parseOperatorSetupReceipt(JSON.stringify({ ...receipt, routeId: bad }), setupRef)).toThrow("OPERATOR_FORM_REFUSED");
      expect(() => parseOperatorSetupReceipt(JSON.stringify({ ...receipt, policyId: bad }), setupRef)).toThrow("OPERATOR_FORM_REFUSED");
    }
  });
  it("real server rendering has no secret input, form action or transport", () => {
    const fetch = vi.fn(() => { throw new Error("MUST_NOT_TRANSPORT"); }); vi.stubGlobal("fetch", fetch);
    const html = renderToStaticMarkup(createElement(OperatorForm, { view: view() }));
    expect(html).toContain("synthetic/model"); expect(html).toContain("Vérification de la page");
    expect(html).not.toMatch(/<input|<form|apiKey|manifestUtf8|synthetic-owner/); expect(fetch).not.toHaveBeenCalled();
  });
  it("copies a Buffer receipt chunk before the next asynchronous read mutates its bytes", async () => {
    const receipt = realReceipt(), bytes = Buffer.from(JSON.stringify(receipt)); let n = 0;
    const read = vi.fn(async () => {
      if (n++ === 0) return { done: false, value: bytes };
      bytes.fill(120); return { done: true, value: undefined };
    });
    const cancel = vi.fn(async () => {}), releaseLock = vi.fn();
    const response = { status: 200, redirected: false, headers: new Headers({ "content-type": "application/json" }),
      body: { getReader: () => ({ read, cancel, releaseLock }) } } as unknown as Response;
    expect(await readOperatorSetupReceipt(response, setupRef, new AbortController().signal)).toEqual(receipt);
    expect(cancel).toHaveBeenCalledTimes(1); expect(releaseLock).toHaveBeenCalledTimes(1);
  });
  it("refuses a wrong setup on a real streamed B1 receipt", async () => {
    const receipt = realReceipt();
    await expect(readOperatorSetupReceipt(Response.json(receipt), "12345678-1234-4234-8234-123456789abd", new AbortController().signal))
      .rejects.toThrow("OPERATOR_FORM_REFUSED");
  });
  it.each(["utf8", "empty-chunks", "redirect"])("refuses %s without reflecting dependency output", async kind => {
    const controller = new AbortController();
    let response: Response;
    if (kind === "utf8") response = new Response(new Uint8Array([0xc3, 0x28]), { headers: { "content-type": "application/json" } });
    else if (kind === "redirect") response = { status: 200, redirected: true } as Response;
    else { let count = 0; response = new Response(new ReadableStream({ pull(c) { if (++count <= 16385) c.enqueue(new Uint8Array()); else c.close(); } }),
      { headers: { "content-type": "application/json" } }); }
    await expect(readOperatorSetupReceipt(response, setupRef, controller.signal)).rejects.toThrow(/^OPERATOR_FORM_REFUSED$/);
  });
});

type Node = ReactElement<Record<string, unknown>>;
const nodes = (x: unknown): Node[] => Array.isArray(x) ? x.flatMap(nodes) : isValidElement<Record<string, unknown>>(x) ? [x, ...nodes(x.props.children)] : [];
function mountedHarness(initial = view()) {
  hooks.enabled = true;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(Date, "now").mockReturnValue(instant); vi.spyOn(performance, "now").mockReturnValue(1000);
  const window = Object.assign(new EventTarget(), { location: { origin: "https://endvera-core-sandbox-afterdesk.vercel.app" } });
  vi.stubGlobal("window", window);
  const fetch = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal("fetch", fetch);
  const dom = { value: "" }; let props = initial, tree: unknown, oldRef: ((v: HTMLInputElement | null) => void) | undefined;
  function render(effects = true) {
    hooks.r = hooks.s = hooks.e = 0; tree = OperatorForm({ view: props });
    const ref = nodes(tree).find(n => n.type === "input")?.props.ref as typeof oldRef;
    if (oldRef && oldRef !== ref) oldRef(null); ref?.(dom as HTMLInputElement); oldRef = ref;
    if (effects) hooks.queued.splice(0).forEach(run => run());
  }
  render(); render();
  const submit = () => (nodes(tree).find(n => n.type === "form")!.props.onSubmit as (e: { preventDefault: () => void }) => void)({ preventDefault() {} });
  return { dom, fetch, window, render, submit, nodes: () => nodes(tree),
    setView: (value: ReturnType<typeof view>) => { props = value; },
    replayEffects: () => { for (const effect of hooks.effects) { effect.cleanup?.(); effect.cleanup = effect.run(); } },
    settle: async () => { for (let n = 0; n < 40; n++) await Promise.resolve(); render(); } };
}
describe("independent component handlers, explicit hook/DOM adapter (not browser E2E)", () => {
  it.each(["POST", "GET"])("allowlist admission: %s stays on its exact first-party path regardless of URL-shaped labels", method => {
    const f = mountedHarness({ ...view(), model: "https://foreign.invalid/model", providerEndpoint: "http://169.254.169.254/private" });
    if (method === "POST") { f.dom.value = "synthetic_review_key_12345678901234567890"; f.submit(); }
    else (f.nodes().find(n => n.type === "button" && n.props.type === "button")!.props.onClick as () => void)();
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = f.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/endvera/v1/personal/model/operator-setup" + (method === "GET" ? `?setupRef=${setupRef}` : ""));
    expect(new URL(url, "https://endvera-core-sandbox-afterdesk.vercel.app").origin).toBe("https://endvera-core-sandbox-afterdesk.vercel.app");
    expect(options).toMatchObject({ method, credentials: "same-origin", cache: "no-store", redirect: "error" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    if (method === "POST") expect(JSON.parse(options.body as string)).toEqual({ version: "personal-model-setup-command-v1", setupRef,
      apiKey: "synthetic_review_key_12345678901234567890" });
    else expect(options.body).toBeUndefined();
    expect(url).not.toMatch(/foreign|169\.254|apiKey/);
  });
  it("StrictMode-style effect setup/cleanup/setup before input does not POST or duplicate the explicit submission", async () => {
    const f = mountedHarness(); f.replayEffects(); f.render(); expect(f.fetch).not.toHaveBeenCalled();
    f.dom.value = "synthetic_review_key_12345678901234567890"; f.submit(); f.submit();
    expect(f.fetch).toHaveBeenCalledTimes(1); expect(f.dom.value).toBe("");
    f.replayEffects(); await f.settle();
    expect(f.nodes().some(n => n.type === "input")).toBe(false); expect(f.fetch).toHaveBeenCalledTimes(1);
    expect((f.fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
  });
  it("changed props suppress input before passive effect; restoring original props after revocation does not rearm", () => {
    const f = mountedHarness(); f.dom.value = "synthetic_review_key_12345678901234567890";
    f.setView({ ...view(), setupRef: "12345678-1234-4234-8234-123456789abd" }); f.render(false);
    expect(f.nodes().some(n => n.type === "input")).toBe(false); expect(f.dom.value).toBe(""); expect(f.fetch).not.toHaveBeenCalled();
    hooks.queued.splice(0).forEach(run => run());
    f.setView(view()); f.render(); f.render();
    expect(f.nodes().some(n => n.type === "input")).toBe(false); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("BFCache restoration without a preceding observed pagehide still aborts one pending POST and closes input", async () => {
    const f = mountedHarness(); f.dom.value = "synthetic_review_key_12345678901234567890"; f.submit();
    f.window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })); await f.settle();
    expect(f.nodes().some(n => n.type === "input")).toBe(false); expect(f.dom.value).toBe("");
    expect(f.fetch).toHaveBeenCalledTimes(1); expect((f.fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
  });
});
