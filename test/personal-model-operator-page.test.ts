import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ selector: vi.fn(), redirect: vi.fn() }));
vi.mock("@/server/model-gateway/personal-intent/operator-form", () => ({ readPersonalModelOperatorFormView: h.selector }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
import Page, { metadata, dynamic } from "../src/app/personal/model/operator-setup/page";
import nextConfig from "../next.config";
const view = { version: "personal-model-operator-form-v1", setupRef: "12345678-1234-4234-8234-123456789abc", provider: "openrouter",
  model: "synthetic/model", providerEndpoint: "synthetic-endpoint", purpose: "personal_intent_candidate_v1",
  expiresAt: "2026-09-11T10:00:00.000Z", state: "INPUT_AVAILABLE", executionAuthorized: false, providerVerified: false };
beforeEach(() => { vi.stubGlobal("React", React); h.selector.mockReset(); h.redirect.mockReset(); });
afterEach(() => vi.unstubAllGlobals());
it("unavailable rendering offers no secret input or submit form", async () => {
  h.selector.mockResolvedValue({ status: "UNAVAILABLE" }); const html = renderToStaticMarkup(await Page());
  expect(html).toContain("Connexion pas encore disponible"); expect(html).not.toContain("<input"); expect(html).not.toContain("<form");
  expect(h.selector).toHaveBeenCalledWith(); expect(h.redirect).not.toHaveBeenCalled();
});
it("unauthenticated user receives only a fixed safe login return path", async () => {
  h.selector.mockResolvedValue({ status: "AUTHENTICATION_REQUIRED" }); h.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT_TEST"); });
  await expect(Page()).rejects.toThrow("NEXT_REDIRECT_TEST");
  expect(h.redirect).toHaveBeenCalledExactlyOnceWith("/login?next=%2Fpersonal%2Fmodel%2Foperator-setup");
});
it.each(["INPUT_AVAILABLE", "HISTORY_ONLY"])("SSR %s escapes configured labels and carries no prefilled credential", async state => {
  h.selector.mockResolvedValue({ status: "AVAILABLE", view: { ...view, state, model: '<script>alert("synthetic")</script>' } });
  const html = renderToStaticMarkup(await Page());
  expect(html).not.toContain('<script>alert('); expect(html).not.toContain('type="password"');
  expect(html).not.toContain("manifestUtf8"); expect(html).not.toContain("ciphertext"); expect(html).not.toContain("ENDVERA_CONNECTOR_ENCRYPTION_KEY");
});
it("is request-time and unindexed (metadata only, not a live cache assertion)", () => {
  expect(dynamic).toBe("force-dynamic"); expect(metadata.robots).toEqual({ index: false, follow: false });
});
it("adds only exact-page noncache/referrer headers without removing global security headers", async () => {
  const rules = await nextConfig.headers!(); const page = rules.find(r => r.source === "/personal/model/operator-setup");
  expect(page?.headers).toEqual([{ key: "Cache-Control", value: "private, no-store" },
    { key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }]);
  expect(rules.find(r => r.source === "/:path*")?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
});
