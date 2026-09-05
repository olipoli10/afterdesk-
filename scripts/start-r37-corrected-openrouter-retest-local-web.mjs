import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const HOST = "127.0.0.1";
const PORT = 47837;
const repoRoot = process.cwd();
const nonce = randomUUID();
const validator = resolve(repoRoot, "specs/194-corrected-openrouter-retest/scripts/validate-r37-corrected-retest.ps1");
const reportPath = resolve(repoRoot, "specs/194-corrected-openrouter-retest/evidence/observed-provider-report.json");
let state = "WAITING_FOR_KEY";
let verdict = "";

function headers(type = "text/html; charset=utf-8") {
  return {
    "content-type": type,
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
  };
}

function page(content, refresh = false) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">${refresh ? '<meta http-equiv="refresh" content="3">' : ""}<meta name="viewport" content="width=device-width"><title>ENDVERA — Retest sécurisé</title><style>body{margin:0;background:#07090c;color:#f5f5f2;font:18px system-ui;display:grid;place-items:center;min-height:100vh}.card{width:min(680px,88vw);padding:36px;border:1px solid #8d6933;border-radius:18px;background:#111318}h1{font-size:34px;margin:0 0 12px}.muted{color:#a6a8b0;line-height:1.5}.warn{color:#ffad96}.ok{color:#c6e6b3}input{box-sizing:border-box;width:100%;margin:20px 0;padding:17px;border:1px solid #686b72;border-radius:10px;background:#202228;color:white;font-size:18px}button{padding:16px 22px;border:0;border-radius:10px;background:#d3873c;color:#111;font-weight:750;font-size:18px;cursor:pointer}</style></head><body><main class="card">${content}</main></body></html>`;
}

function render() {
  if (state === "WAITING_FOR_KEY") {
    return page(`<h1>Retest R37 sécurisé</h1><p class="warn">Utilise seulement une clé qui n’a jamais été affichée. Révoque d’abord toute clé visible dans une capture.</p><p class="muted">La clé reste en mémoire locale, n’est ni affichée, ni journalisée, ni écrite sur disque.</p><form method="post" action="/start"><input type="hidden" name="nonce" value="${nonce}"><label for="key">Clé OpenRouter temporaire</label><input id="key" name="key" type="password" autocomplete="off" spellcheck="false" required minlength="20" autofocus><button type="submit">Démarrer le retest unique</button></form>`);
  }
  if (state === "RUNNING") return page('<h1>Campagne en cours</h1><p class="ok">La clé a été admise en mémoire. Ne ferme pas cette page.</p><p class="muted">Préflight, PostgreSQL, appels synthétiques, verdict et nettoyage s’exécutent automatiquement.</p>', true);
  if (state === "COMPLETE") return page(`<h1>Campagne terminée</h1><p class="ok">Verdict : ${verdict}</p><p class="muted">La clé a été retirée du processus. Tu peux fermer cette page.</p>`);
  return page('<h1>Campagne arrêtée</h1><p class="warn">Le validateur a refusé ou interrompu la campagne. Aucun nouvel essai ne sera lancé automatiquement.</p>');
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2048) throw new Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function runCampaign(key) {
  state = "RUNNING";
  const childEnv = { ...process.env, R37_OPENROUTER_CONTROLLER_API_KEY: key };
  const child = spawn("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", validator, "-RequireComplete",
  ], { cwd: repoRoot, env: childEnv, stdio: "ignore", windowsHide: true });
  key = "";
  delete childEnv.R37_OPENROUTER_CONTROLLER_API_KEY;
  process.stdout.write("R37_LOCAL_WEB_CAMPAIGN_STARTED=true\n");
  child.once("exit", async (code) => {
    try {
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      verdict = String(report.verdict ?? "");
      state = verdict === "OPENROUTER_SANDBOX_OBSERVED_PASS" || verdict === "REWORK" ? "COMPLETE" : "FAILED";
    } catch {
      state = "FAILED";
    }
    process.stdout.write(`R37_LOCAL_WEB_CAMPAIGN_EXIT=${code ?? -1}\n`);
    process.stdout.write(`R37_LOCAL_WEB_STATE=${state}\n`);
    if (verdict) process.stdout.write(`R37_LOCAL_WEB_VERDICT=${verdict}\n`);
  });
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, headers()); response.end(render()); return;
    }
    if (request.method === "POST" && request.url === "/start" && state === "WAITING_FOR_KEY") {
      const data = new URLSearchParams(await readBody(request));
      const suppliedNonce = data.get("nonce") ?? "";
      let key = data.get("key") ?? "";
      if (suppliedNonce !== nonce || key.length < 20 || /\s/u.test(key)) {
        key = "";
        response.writeHead(400, headers()); response.end(page('<h1>Clé refusée</h1><p class="warn">La valeur est absente ou invalide. Recharge la page et utilise une nouvelle clé privée.</p>')); return;
      }
      runCampaign(key);
      key = "";
      response.writeHead(303, { ...headers(), location: "/" }); response.end(); return;
    }
    response.writeHead(404, headers()); response.end(page("<h1>Introuvable</h1>"));
  } catch {
    response.writeHead(400, headers()); response.end(page('<h1>Demande refusée</h1><p class="warn">Aucune donnée n’a été admise.</p>'));
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`R37_LOCAL_WEB_READY=http://${HOST}:${PORT}/\n`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
