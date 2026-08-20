/**
 * Local-only browser evidence for the ENDVERA voice composer.
 *
 * This runner uses Chrome DevTools directly, performs no provider call and
 * expects a local synthetic server-action mutation controlled by the lane.
 */
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const BROWSERS = {
  chrome: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  edge: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
};

function arg(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
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
      for (const callback of this.listeners.get(message.method) ?? []) callback(message.params);
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
      const done = (params) => {
        clearTimeout(timeout);
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((item) => item !== done));
        resolve(params);
      };
      const timeout = setTimeout(() => {
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((item) => item !== done));
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      this.listeners.set(method, [...(this.listeners.get(method) ?? []), done]);
    });
  }

  close() {
    this.ws.close();
  }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function stopBrowserProcessTree(browserProcess) {
  if (!browserProcess.pid) return;
  if (process.platform !== "win32") {
    browserProcess.kill();
    return;
  }
  await new Promise((resolve) => {
    const killer = spawn("taskkill.exe", ["/PID", String(browserProcess.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    killer.once("exit", resolve);
    killer.once("error", resolve);
  });
}

async function main() {
  const base = arg("base", "http://localhost:3217");
  const out = path.resolve(arg("out", path.join(process.cwd(), "docs/evidence/endvera-portal-voice/interactions")));
  const scenario = arg("scenario", "disclosure");
  const language = arg("lang", "en");
  const permission = arg("permission", "granted");
  const [width, height] = arg("viewport", "390x844").split("x").map(Number);
  const zoom = Number(arg("zoom", "100"));
  if (!Number.isFinite(zoom) || zoom < 100 || zoom > 400) {
    throw new Error(`Unsupported zoom percentage: ${zoom}`);
  }
  const zoomScale = zoom / 100;
  const cssWidth = Math.round(width / zoomScale);
  const cssHeight = Math.round(height / zoomScale);
  const browser = arg("browser", "chrome");
  const browserExecutable = BROWSERS[browser];
  if (!browserExecutable) throw new Error(`Unsupported browser: ${browser}`);
  const recordMs = Number(arg("record-ms", "1200"));
  const port = Number(arg("port", String(9400 + Math.floor(Math.random() * 200))));
  const profile = path.join(out, `chrome-profile-${port}`);
  await mkdir(out, { recursive: true });
  await rm(profile, { recursive: true, force: true });

  const chromeArgs = [
    "--headless=new",
    "--disable-gpu",
    "--autoplay-policy=no-user-gesture-required",
    "--no-first-run",
    "--no-default-browser-check",
    "--use-fake-device-for-media-stream",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ];
  if (permission !== "denied") chromeArgs.splice(6, 0, "--use-fake-ui-for-media-stream");
  const chrome = spawn(browserExecutable, chromeArgs, { stdio: "ignore" });

  let cdp;
  try {
    const pages = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const page = pages.find((candidate) => candidate.type === "page");
    if (!page) throw new Error("Chrome opened without a page target");
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.call("Page.enable");
    await cdp.call("Runtime.enable");
    await cdp.call("Emulation.setDeviceMetricsOverride", {
      width: cssWidth,
      height: cssHeight,
      deviceScaleFactor: zoomScale,
      mobile: cssWidth <= 500,
    });
    await cdp.call("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await cdp.call("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        window.__voiceTrackStops = 0;
        window.__voiceRecorderSessions = [];
        const original = MediaStreamTrack.prototype.stop;
        MediaStreamTrack.prototype.stop = function () {
          window.__voiceTrackStops += 1;
          return original.call(this);
        };
        const NativeMediaRecorder = window.MediaRecorder;
        class EvidenceMediaRecorder extends NativeMediaRecorder {
          constructor(...args) {
            super(...args);
            const session = { bytes: 0, chunks: 0, startedAt: null, stoppedAt: null, mimeType: this.mimeType };
            window.__voiceRecorderSessions.push(session);
            this.addEventListener('start', () => { session.startedAt = performance.now(); });
            this.addEventListener('dataavailable', (event) => {
              session.bytes += event.data.size;
              session.chunks += 1;
            });
            this.addEventListener('stop', () => { session.stoppedAt = performance.now(); });
          }
        }
        Object.defineProperty(EvidenceMediaRecorder, 'isTypeSupported', {
          value: NativeMediaRecorder.isTypeSupported.bind(NativeMediaRecorder),
        });
        window.MediaRecorder = EvidenceMediaRecorder;
      })()`,
    });

    const origin = new URL(base).origin;
    if (permission === "denied") {
      await cdp.call("Browser.setPermission", {
        permission: { name: "microphone" },
        setting: "denied",
        origin,
      });
    } else {
      await cdp.call("Browser.grantPermissions", {
        permissions: ["audioCapture"],
        origin,
      });
    }

    const url = new URL("/voice-evidence", base);
    url.searchParams.set("lang", language);
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.call("Page.navigate", { url: url.href });
    await loaded;
    await sleep(2_500);

    if (permission === "missing") {
      await cdp.call("Runtime.evaluate", {
        expression: `navigator.mediaDevices.getUserMedia = async () => {
          throw new DOMException("No microphone", "NotFoundError");
        }`,
      });
    } else if (permission === "granted") {
      await cdp.call("Runtime.evaluate", {
        expression: `(() => {
          const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
          const context = new AudioContextCtor();
          const destination = context.createMediaStreamDestination();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          gain.gain.value = 0.01;
          oscillator.connect(gain).connect(destination);
          oscillator.start();
          void context.resume();
          window.__voiceSyntheticAudio = { source: 'web-audio-oscillator', context, oscillator };
          navigator.mediaDevices.getUserMedia = async () => destination.stream;
        })()`,
      });
    }

    const evaluate = async (expression) => {
      const result = await cdp.call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      }
      return result.result.value;
    };
    const click = (selector, index = 0) => evaluate(`(() => {
      const elements = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((element) => !element.disabled);
      const element = elements[${index}];
      if (!element) throw new Error("Missing element ${selector}[${index}]");
      element.click();
      return element.textContent.trim();
    })()`);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const ready = await evaluate(`Boolean(document.querySelector('[data-voice-intake] button:not([disabled])'))`);
      if (ready) break;
      await sleep(100);
    }
    await click("[data-voice-intake] button", 0);
    await sleep(250);

    if (scenario !== "disclosure") {
      await evaluate(`document.querySelector('[data-voice-intake] input[type=checkbox]').click()`);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const enabled = await evaluate(`!document.querySelector('[data-voice-intake] button').disabled`);
        if (enabled) break;
        await sleep(100);
      }
      const consentState = await evaluate(`(() => {
        const input = document.querySelector('[data-voice-intake] input[type=checkbox]');
        const button = document.querySelector('[data-voice-intake] button');
        return { checked: input.checked, startDisabled: button.disabled };
      })()`);
      if (!consentState.checked || consentState.startDisabled) {
        throw new Error(`Consent did not enable recording: ${JSON.stringify(consentState)}`);
      }
      await evaluate(`document.querySelector('[data-voice-intake] button').click()`);
      await sleep(permission === "granted" ? 2_500 : 1_500);
      if (permission === "granted") {
        const captureState = await evaluate(`({
          status: document.querySelector('[data-voice-primary-status]')?.textContent.trim() || null,
          alert: document.querySelector('[data-voice-intake] [role=alert]')?.textContent.trim() || null,
          text: document.querySelector('[data-voice-intake]').textContent.trim()
        })`);
        if (!captureState.status?.match(/Recording|Enregistrement|Grabando|Nagre-record/i)) {
          throw new Error(`Recording did not start: ${JSON.stringify(captureState)}`);
        }
      }
    }

    const screenshots = [];
    const capture = async (suffix) => {
      const name = `${scenario}-${permission}-${language}-${browser}-${width}x${height}-${zoom}pct${suffix ? `-${suffix}` : ""}.png`;
      const image = await cdp.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(path.join(out, name), Buffer.from(image.data, "base64"));
      screenshots.push(name);
    };

    if (scenario === "paused") {
      await click("[data-voice-intake] button", 0);
      await sleep(250);
    } else if (scenario === "cancelled") {
      await click("[data-voice-intake] button", 2);
      await sleep(200);
      await capture("confirmation");
      await click("[data-voice-intake] [role=alertdialog] button", 0);
      await sleep(2_000);
    } else if (["ready", "incomplete", "uncertain"].includes(scenario)) {
      await sleep(recordMs);
      await click("[data-voice-intake] button", 1);
      await sleep(4_000);
    }

    await capture("");
    const metrics = await evaluate(`(() => {
      const root = document.documentElement;
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const targets = [...document.querySelectorAll('[data-voice-intake] button, [data-voice-intake] input')]
        .filter(visible)
        .map((element) => {
          const effectiveTarget = element.matches('input') ? element.closest('label') || element : element;
          const rect = effectiveTarget.getBoundingClientRect();
          return { text: effectiveTarget.textContent.trim(), width: Math.round(rect.width), height: Math.round(rect.height) };
        });
      const smallText = [...document.querySelectorAll('[data-voice-intake] *')]
        .filter(visible)
        .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
        .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 12)
        .map((element) => element.textContent.trim());
      return {
        bodyText: document.body.innerText,
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        targets,
        smallTargets: targets.filter((target) => target.width < 44 || target.height < 44),
        smallText,
        activeElement: document.activeElement === document.body
          ? 'BODY'
          : document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName,
        composerValue: document.querySelector('#a2-request-composer')?.value || '',
        alerts: [...document.querySelectorAll('[role=alert]')].map((element) => element.textContent.trim()),
        primaryStatus: document.querySelector('[data-voice-primary-status]')?.textContent.trim() || null,
        trackStops: window.__voiceTrackStops,
        recorderSessions: (window.__voiceRecorderSessions || []).map((session) => ({
          ...session,
          durationMs: session.startedAt === null || session.stoppedAt === null
            ? null
            : Math.round(session.stoppedAt - session.startedAt),
        })),
        mediaRecorderSupported: typeof MediaRecorder !== 'undefined',
        supportedMimeTypes: ${JSON.stringify(["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"])}.filter((mime) => MediaRecorder.isTypeSupported(mime)),
      };
    })()`);
    const report = {
      createdAt: new Date().toISOString(),
      base,
      scenario,
      permission,
      language,
      viewport: { width, height },
      cssViewport: { width: cssWidth, height: cssHeight },
      zoom,
      browser,
      recordMs,
      screenshots,
      metrics,
    };
    const reportPath = path.join(out, `${scenario}-${permission}-${language}-${browser}-${width}x${height}-${zoom}pct.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ reportPath, screenshots, metrics }, null, 2));
  } finally {
    if (cdp) {
      await cdp.call("Browser.close").catch(() => {});
      cdp.close();
    }
    await sleep(500);
    await stopBrowserProcessTree(chrome);
    await sleep(500);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
