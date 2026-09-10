import { describe, expect, it } from "vitest";
import { createPersonalDraftRequests, loadPersonalServiceState, personalDeliveryLabel, personalPairingSmsUri } from "../src/lib/personal-service";
describe("personal SMS app safety copy", () => {
  it("opens only a validated SMS draft, not an arbitrary URL", () => {
    const pairing = { number: "+15005550006", text: `CONNECTER ENDVERA ${"a".repeat(32)}`, expiresAt: new Date(Date.now() + 600000).toISOString() };
    expect(personalPairingSmsUri(pairing)).toBe(`sms:${pairing.number}?body=${encodeURIComponent(pairing.text)}`);
    expect(() => personalPairingSmsUri({ ...pairing, number: "https://evil.example" })).toThrow();
    expect(() => personalPairingSmsUri({ ...pairing, text: "send something else" })).toThrow();
  });
  it("does not call provider acceptance delivery or a completed call understood", () => {
    const base = { id: "synthetic", kind: "sms_outbound" as const, status: "completed", requestHash: "a".repeat(64), request: { to: "+15005550001", from: "+15005550006", text: "Synthetic" }, deliveryConfirmed: false, receiptStates: [], createdAt: new Date().toISOString() };
    expect(personalDeliveryLabel(base)).toContain("livraison non confirmée");
    expect(personalDeliveryLabel({ ...base, kind: "voice_outbound", receiptStates: ["completed"] })).toContain("écoute du message non vérifiée");
  });
});

describe("personal draft retry identity", () => {
  const payload = { workspaceId: "synthetic-workspace", kind: "sms_outbound" as const, to: "+15005550001", text: "Message synthétique" };
  const receipt = { operationId: "11111111-1111-4111-8111-111111111111", requestHash: "a".repeat(64), status: "pending" };
  function store() {
    let counter = 0;
    return createPersonalDraftRequests(() => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`);
  }
  it("keeps the same ID after a lost response, even after another payload was selected", () => {
    const requests = store(); const first = requests.prepare(payload);
    requests.prepare({ ...payload, kind: "voice_outbound" });
    expect(requests.prepare(payload)).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });
  it("allocates a distinct ID for each exact workspace, channel, recipient and text", () => {
    const requests = store();
    const variants = [payload, { ...payload, workspaceId: "other-workspace" }, { ...payload, kind: "voice_outbound" as const }, { ...payload, to: "+15005550002" }, { ...payload, text: `${payload.text} ` }];
    expect(new Set(variants.map(value => requests.prepare(value).requestId)).size).toBe(variants.length);
  });
  it("rotates after a valid prepare receipt so an intentional repeat is possible without claiming delivery", () => {
    const requests = store(); const first = requests.prepare(payload);
    expect(requests.confirm(first, receipt)).toEqual(receipt);
    expect(requests.prepare(payload).requestId).not.toBe(first.requestId);
    expect(receipt).not.toHaveProperty("deliveryConfirmed");
  });
  it("retains retry identity on malformed receipts and prevents an old confirmation consuming a newer request", () => {
    const requests = store(); const first = requests.prepare(payload);
    expect(() => requests.confirm(first, { ok: true })).toThrow();
    expect(requests.prepare(payload)).toBe(first);
    requests.confirm(first, receipt);
    const second = requests.prepare(payload);
    expect(() => requests.confirm(first, receipt)).toThrow("DRAFT_CONFIRMATION_STALE");
    expect(requests.prepare(payload)).toBe(second);
  });
  it("does not silently evict an uncertain request when its bounded store is full", () => {
    const requests = store(); const first = requests.prepare(payload);
    for (let index = 1; index < 16; index += 1) requests.prepare({ ...payload, text: `Synthétique ${index}` });
    expect(() => requests.prepare({ ...payload, text: "17e demande" })).toThrow("DRAFT_RETRY_CAPACITY_REACHED");
    expect(requests.prepare(payload)).toBe(first);
    requests.confirm(first, receipt);
    expect(requests.prepare({ ...payload, text: "17e demande" })).toHaveProperty("requestId");
  });
});

describe("independent personal service activation reads", () => {
  const phone = { configured: true, number: "+15005550006", boundPhone: null };
  it("keeps a configured number available for pairing when outbox fails", async () => {
    const state = await loadPersonalServiceState(() => Promise.resolve(phone), () => Promise.reject(new Error("outbox unavailable")));
    expect(state).toEqual({ phone, outbox: null, phoneUnavailable: false, outboxUnavailable: true });
  });
  it("does not preserve a previously verified phone when its next read fails", async () => {
    expect((await loadPersonalServiceState(() => Promise.resolve({ ...phone, boundPhone: "+15005550001" }), () => Promise.resolve({ operations: [] }))).phone?.boundPhone).toBe("+15005550001");
    const state = await loadPersonalServiceState(() => Promise.reject(new Error("auth unavailable")), () => Promise.resolve({ operations: [] }));
    expect(state).toEqual({ phone: null, outbox: { operations: [] }, phoneUnavailable: true, outboxUnavailable: false });
  });
  it("contains synchronous reader failures and rejects malformed status without hiding the other read", async () => {
    const state = await loadPersonalServiceState(() => { throw new Error("sync failure"); }, () => Promise.resolve({ operations: [] }));
    expect(state.phoneUnavailable).toBe(true);
    expect(state.outboxUnavailable).toBe(false);
    const malformed = await loadPersonalServiceState(() => Promise.resolve({ ...phone, number: "not a phone" }), () => Promise.resolve({ operations: [] }));
    expect(malformed.phone).toBeNull();
    expect(malformed.phoneUnavailable).toBe(true);
    expect(malformed.outbox).toEqual({ operations: [] });
  });
  it("distinguishes an unconfigured service from an unavailable status", async () => {
    const state = await loadPersonalServiceState(() => Promise.resolve({ configured: false, number: null, boundPhone: null }), () => Promise.resolve({ operations: [] }));
    expect(state.phone?.configured).toBe(false);
    expect(state.phoneUnavailable).toBe(false);
    expect(state.outboxUnavailable).toBe(false);
  });
});
