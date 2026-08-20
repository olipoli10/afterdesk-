/**
 * Read-only browser audit for ENDVERA public routes.
 *
 * Uses Chrome's DevTools protocol directly so the audit has no package or
 * lockfile dependency. It never submits a form, writes a cookie deliberately,
 * or calls a non-GET application route.
 *
 * Usage:
 *   node scripts/endvera-visual-audit.mjs \
 *     --base=https://endvera.com \
 *     --out=C:\\path\\to\\evidence \
 *     --viewport=390x844
 */

import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const LANGS = ["en", "fr", "es", "tl"];
const FALLBACK_ROUTES = [
  "/",
  "/workers",
  "/academy",
  "/about",
  "/how-it-works",
  "/services",
  "/inside",
  "/ledger",
  "/security",
  "/privacy",
  "/terms",
  "/acceptable-use",
  "/login",
  "/register",
];

function arg(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function slug(value) {
  return value.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
}

function localizedUrl(base, route, lang) {
  const url = new URL(route, base);
  // Force every locale, including English. The production language cookie is
  // intentionally sticky, so auditing the canonical bare URL after Tagalog
  // would otherwise measure Tagalog while labelling the row English.
  url.searchParams.set("lang", lang);
  return url.href;
}

async function routesFromSitemap(base) {
  try {
    const response = await fetch(new URL("/sitemap.xml", base));
    if (!response.ok) throw new Error(`sitemap ${response.status}`);
    const xml = await response.text();
    const found = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => {
      const url = new URL(match[1]);
      return `${url.pathname}${url.search}`;
    });
    return [...new Set([...found, ...FALLBACK_ROUTES])];
  } catch {
    return FALLBACK_ROUTES;
  }
}

async function waitForJson(url, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Chrome DevTools endpoint did not open: ${url}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const callbacks = this.listeners.get(message.method) ?? [];
      for (const callback of callbacks) callback(message.params);
    });
  }

  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((x) => x !== done));
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const done = (params) => {
        clearTimeout(timeout);
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((x) => x !== done));
        resolve(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) ?? []), done]);
    });
  }

  close() {
    this.ws.close();
  }
}

const MEASURE = String.raw`(() => {
  const root = document.documentElement;
  const body = document.body;
  const visible = (el, style, rect) =>
    style.display !== "none" && style.visibility !== "hidden" &&
    Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
  const selector = (el) => {
    if (el.id) return "#" + el.id;
    const tag = el.tagName.toLowerCase();
    const marker = [...el.attributes].find((a) => a.name.startsWith("data-"));
    if (marker) return tag + "[" + marker.name + "]";
    return tag + (typeof el.className === "string" && el.className.trim()
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "");
  };
  const overflow = [];
  const smallText = [];
  const smallTargets = [];
  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!visible(el, style, rect)) continue;
    if (rect.right > root.clientWidth + 1 || rect.left < -1) {
      overflow.push({ selector: selector(el), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) });
    }
    const ownText = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (ownText && Number.parseFloat(style.fontSize) < 12) {
      smallText.push({ selector: selector(el), px: Number.parseFloat(style.fontSize), text: el.textContent.trim().slice(0, 80) });
    }
    if (el.matches("a,button,input,select,textarea,summary,[role=button]")) {
      if (rect.width < 44 || rect.height < 44) {
        smallTargets.push({ selector: selector(el), width: Math.round(rect.width), height: Math.round(rect.height), text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 80) });
      }
    }
  }
  const headings = [...document.querySelectorAll("h1")].map((el) => el.textContent.trim());
  return {
    title: document.title,
    htmlLang: root.lang,
    bodyChars: body.innerText.trim().length,
    mainText: (document.querySelector("main")?.innerText || "").trim().slice(0, 1800),
    h1: headings,
    h1Count: headings.length,
    viewportWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
    horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
    overflow: overflow.slice(0, 25),
    smallText: smallText.slice(0, 40),
    smallTargets: smallTargets.slice(0, 40),
    errorOverlay: Boolean(document.querySelector("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")),
    a2Count: document.querySelectorAll("[data-a2-being], [data-a2-avatar], [data-a2-stop]").length,
  };
})()`;

async function main() {
  const base = arg("base", "https://endvera.com");
  const out = path.resolve(arg("out", path.join(process.cwd(), ".audit-output")));
  const viewport = arg("viewport", "390x844").split("x").map(Number);
  const width = viewport[0];
  const height = viewport[1];
  const reducedMotion = arg("reduced-motion", "false") === "true";
  const capture = arg("capture", "core");
  const settleMs = Number(arg("settle", reducedMotion ? "120" : "350"));
  const port = Number(arg("port", String(9300 + Math.floor(Math.random() * 300))));
  const profile = path.join(out, `chrome-profile-${port}`);
  await mkdir(out, { recursive: true });
  await rm(profile, { recursive: true, force: true });

  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });

  const report = {
    base,
    createdAt: new Date().toISOString(),
    viewport: { width, height },
    reducedMotion,
    routes: [],
  };

  try {
    const pages = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const page = pages.find((candidate) => candidate.type === "page");
    if (!page) throw new Error("Chrome opened without a page target");
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.call("Page.enable");
    await cdp.call("Runtime.enable");
    await cdp.call("Network.enable");
    await cdp.call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 500,
    });
    await cdp.call("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }],
    });

    const requestedRoutes = arg("routes", "");
    const routes = requestedRoutes
      ? requestedRoutes.split(",").map((route) => route.trim()).filter(Boolean)
      : await routesFromSitemap(base);
    const coreCaptures = new Set(FALLBACK_ROUTES);
    let completed = 0;
    for (const route of routes) {
      for (const lang of LANGS) {
        const url = localizedUrl(base, route, lang);
        let documentStatus = null;
        const onResponse = (params) => {
          if (params.type === "Document" && params.response.url === url) {
            documentStatus = params.response.status;
          }
        };
        cdp.listeners.set("Network.responseReceived", [
          ...(cdp.listeners.get("Network.responseReceived") ?? []),
          onResponse,
        ]);
        const loaded = cdp.once("Page.loadEventFired");
        await cdp.call("Page.navigate", { url });
        await loaded;
        await new Promise((resolve) => setTimeout(resolve, settleMs));
        const evaluated = await cdp.call("Runtime.evaluate", {
          expression: MEASURE,
          returnByValue: true,
        });
        cdp.listeners.set(
          "Network.responseReceived",
          (cdp.listeners.get("Network.responseReceived") ?? []).filter((x) => x !== onResponse),
        );
        const metrics = evaluated.result.value;
        const shouldCapture = capture === "all" || (capture === "core" && coreCaptures.has(route));
        let screenshot = null;
        if (shouldCapture) {
          const image = await cdp.call("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: false,
          });
          screenshot = `${slug(route)}-${lang}-${width}x${height}${reducedMotion ? "-reduce" : ""}.png`;
          await writeFile(path.join(out, screenshot), Buffer.from(image.data, "base64"));
        }
        report.routes.push({ route, lang, url, status: documentStatus, screenshot, ...metrics });
        completed += 1;
        if (completed % 20 === 0) console.log(`audited ${completed}/${routes.length * LANGS.length}`);
      }
    }
    cdp.close();
  } finally {
    chrome.kill();
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      chrome.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    // Crashpad can hold its metrics file for a few milliseconds after the
    // browser process exits on Windows. Evidence is complete at this point;
    // a stale disposable profile must not discard the report.
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  const reportPath = path.join(out, `audit-${width}x${height}${reducedMotion ? "-reduce" : ""}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const failures = report.routes.filter((item) => item.status !== 200 || item.errorOverlay || item.horizontalOverflow);
  console.log(JSON.stringify({ reportPath, audited: report.routes.length, failures: failures.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
