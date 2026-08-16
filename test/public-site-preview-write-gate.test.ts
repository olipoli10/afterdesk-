/* Phase 1.4B.2 guards - the Preview write gate must cover EVERY application
   route, including page-bound Server Actions (Next 16: Server Functions are
   POST requests to the page route that uses them - see the installed
   use-server.md). Written RED against cb9557c, whose hand-maintained
   matcher list omitted /register/va and every future action page.

   These tests use the official helper (next/experimental/testing/server)
   against the REAL exported config and proxy - never a duplicate. */
import "./__als-polyfill";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
/* The installed 16.2.12 dist exports the helper under its middleware name
   (unstable_doesMiddlewareMatch) while this version's proxy.md shows the
   proxy-named alias; same signature, same semantics. Using the REAL export. */
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "../src/proxy";

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

const OLD_ENV = process.env.VERCEL_ENV;
afterEach(() => {
  if (OLD_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = OLD_ENV;
});

describe("preview matcher covers page-bound Server Actions", () => {
  it("matches /register/va - the registerVa Server Action page", () => {
    expect(matches("/register/va")).toBe(true);
  });
  it("matches /register and /login", () => {
    expect(matches("/register")).toBe(true);
    expect(matches("/login")).toBe(true);
  });
  it("matches /api routes", () => {
    expect(matches("/api/auth/example")).toBe(true);
  });
  it("matches application routes that no hand-maintained list ever named", () => {
    expect(matches("/verify-email")).toBe(true);
    expect(matches("/academy/some-course")).toBe(true);
  });
  it("does not depend on a fragile page allowlist: coverage is the negated-static form", () => {
    const flat = JSON.stringify(config.matcher);
    expect(flat).toMatch(/\(\?\!/); // a negative lookahead, not a page list
    expect(flat).not.toMatch(/"\/register\/va"/); // no per-page patchwork
  });
  it("intentionally excludes framework/static resources only", () => {
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
    expect(matches("/_next/image?url=x")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
    expect(matches("/sitemap.xml")).toBe(false);
    expect(matches("/robots.txt")).toBe(false);
  });
});

describe("preview refuses every non-idempotent method before any handler", () => {
  const req = (method: string, path: string) =>
    new NextRequest(`https://preview.example${path}`, { method });

  it("POST to /register/va gets 403 in preview - registerVa/Prisma is never reached", async () => {
    process.env.VERCEL_ENV = "preview";
    const res = proxy(req("POST", "/register/va"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/read-only/);
  });
  it("POST to /api/anything gets 403 in preview", () => {
    process.env.VERCEL_ENV = "preview";
    expect(proxy(req("POST", "/api/tasks")).status).toBe(403);
  });
  it("GET/HEAD/OPTIONS pass in preview", () => {
    process.env.VERCEL_ENV = "preview";
    for (const m of ["GET", "HEAD", "OPTIONS"]) {
      expect(proxy(req(m, "/register/va")).status, m).not.toBe(403);
    }
  });
  it("production and unset environments never trigger the preview refusal", () => {
    process.env.VERCEL_ENV = "production";
    expect(proxy(req("POST", "/register/va")).status).not.toBe(403);
    delete process.env.VERCEL_ENV;
    expect(proxy(req("POST", "/register/va")).status).not.toBe(403);
  });
});

describe("preview blocks the ENTIRE /api surface, every method (1.4B.4)", () => {
  const req = (method: string, path: string) =>
    new NextRequest(`https://preview.example${path}`, { method });

  it("GET/HEAD/OPTIONS/POST on /api/cron/maintenance all 403 in preview", () => {
    process.env.VERCEL_ENV = "preview";
    for (const m of ["GET", "HEAD", "OPTIONS", "POST"]) {
      expect(proxy(req(m, "/api/cron/maintenance")).status, m).toBe(403);
    }
  });
  it("GET /api/files/x/download and GET /api/auth/session 403 in preview", () => {
    process.env.VERCEL_ENV = "preview";
    expect(proxy(req("GET", "/api/files/x/download")).status).toBe(403);
    expect(proxy(req("GET", "/api/auth/session")).status).toBe(403);
  });
  it("ordinary pages still pass GET/HEAD/OPTIONS in preview", () => {
    process.env.VERCEL_ENV = "preview";
    for (const p of ["/", "/register/va", "/some-unlisted-route"]) {
      for (const m of ["GET", "HEAD", "OPTIONS"]) {
        expect(proxy(req(m, p)).status, `${m} ${p}`).not.toBe(403);
      }
    }
  });
  it("page POSTs stay blocked and production keeps its API untouched", () => {
    process.env.VERCEL_ENV = "preview";
    expect(proxy(req("POST", "/register/va")).status).toBe(403);
    process.env.VERCEL_ENV = "production";
    expect(proxy(req("GET", "/api/cron/maintenance")).status).not.toBe(403);
    expect(proxy(req("POST", "/api/tasks")).status).not.toBe(403);
    delete process.env.VERCEL_ENV;
    expect(proxy(req("GET", "/api/cron/maintenance")).status).not.toBe(403);
  });
});
