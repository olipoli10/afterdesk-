import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [url, output, widthText, heightText, motion = "no-preference", target = "top"] = process.argv.slice(2);
if (!url || !output || !widthText || !heightText) {
  throw new Error("usage: node capture-local-publicsite.mjs <url> <output> <width> <height> [reduce]");
}

const width = Number(widthText);
const height = Number(heightText);
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = resolve(".next", "codex-v7", `cdp-${process.pid}`);
const child = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

const browserWs = await new Promise((resolveWs, reject) => {
  let stderr = "";
  const timer = setTimeout(() => reject(new Error(`Chrome CDP timeout: ${stderr}`)), 10_000);
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    const found = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (found) {
      clearTimeout(timer);
      resolveWs(found[1]);
    }
  });
  child.once("exit", (code) => reject(new Error(`Chrome exited before CDP was ready (${code}): ${stderr}`)));
});

const port = new URL(browserWs).port;
const pageTarget = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let id = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
  else waiter.resolve(message.result);
});

function send(method, params = {}) {
  return new Promise((resolveResult, reject) => {
    const commandId = ++id;
    pending.set(commandId, { resolve: resolveResult, reject });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
  await send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: motion }],
  });
  await send("Page.navigate", { url });
  await new Promise((done) => setTimeout(done, 2_000));
  await send("Runtime.evaluate", {
    expression: "document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 350)))",
    awaitPromise: true,
  });
  if (target !== "top") {
    const selectors = {
      act2: '[data-act="2"]',
      solution: '[data-act="2b"]',
      engine: '[data-act="3"]',
      result: '[data-act="4"]',
      example: '[data-v7-sem="example"]',
    };
    const selector = selectors[target];
    if (!selector) throw new Error(`unknown capture target: ${target}`);
    await send("Runtime.evaluate", {
      expression: `(() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        if (!node) throw new Error(${JSON.stringify(`missing target ${target}`)});
        window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY);
      })()`,
    });
    await new Promise((done) => setTimeout(done, 650));
  }

  const metrics = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      return {
        innerWidth,
        innerHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        header: rect('[data-site-header]'),
        wordmark: rect('[data-site-wordmark]'),
        earlyAccess: rect('[data-early-access]'),
        hero: rect('[data-act="1"]'),
        heading: rect('h1'),
        act2Heading: rect('[data-act="2"] h2'),
        act4Heading: rect('[data-act="4"] h2'),
        resultCard: rect('[data-act="4"] .rounded-md'),
        request: rect('[data-act="1"] input'),
        a2: rect('[data-a2-dock]'),
      };
    })()`,
  });
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const absoluteOutput = resolve(output);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, Buffer.from(shot.data, "base64"));
  console.log(JSON.stringify({ output: absoluteOutput, motion, target, ...metrics.result.value }, null, 2));
} finally {
  socket.close();
  child.kill();
}
