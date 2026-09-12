import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

const PROJECT = "prj_cEvjMH8iJ2C9khbZ0vsQlGKQ4Y75";
const TEAM = "team_txoYNQAo21jmENCfI2EG4pdP";
const PREFIX = "ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION_PART_";
const fail = () => { throw new Error("PERSONAL_MODEL_VERCEL_CONFIGURATION_REFUSED"); };

async function readStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const copy = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(String(chunk), "utf8");
    bytes += copy.byteLength;
    if (bytes > 32_768) fail();
    chunks.push(copy);
  }
  const joined = Buffer.concat(chunks);
  try {
    const value = joined.toString("utf8");
    if (!Buffer.from(value).equals(joined)) fail();
    const parsed = JSON.parse(value);
    if (parsed?.version !== "personal-model-operator-ingress-configuration-v1" || parsed?.mode !== "ENABLED"
      || typeof parsed?.setupRef !== "string" || parsed.setupRef.length > 64) fail();
    return { value, setupRef: parsed.setupRef };
  } finally {
    joined.fill(0);
    chunks.forEach(chunk => chunk.fill(0));
  }
}

function readToken() {
  const appdata = process.env.APPDATA;
  if (typeof appdata !== "string") fail();
  const file = join(appdata, "com.vercel.cli", "Data", "auth.json");
  if (!lstatSync(file).isFile() || resolve(realpathSync(file)) !== resolve(file)) fail();
  const bytes = readFileSync(file);
  try {
    if (bytes.length > 65_536) fail();
    const token = JSON.parse(bytes.toString("utf8"))?.token;
    if (typeof token !== "string" || !/^[A-Za-z0-9_.-]{16,8192}$/u.test(token)) fail();
    return token;
  } finally { bytes.fill(0); }
}

function splitUtf8(value, maxBytes = 7000) {
  const parts = [];
  let current = "", bytes = 0;
  for (const character of value) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > maxBytes && current) { parts.push(current); current = ""; bytes = 0; }
    current += character; bytes += size;
  }
  if (current) parts.push(current);
  if (parts.length < 1 || parts.length > 4 || parts.join("") !== value) fail();
  return parts;
}

async function main() {
  const { value, setupRef } = await readStdin();
  let token = readToken();
  try {
    const parts = splitUtf8(value);
    const values = [
      ...parts.map((part, index) => ({ key: `${PREFIX}${index + 1}`, value: part, type: "sensitive", target: ["production"] })),
      { key: "ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION_PART_COUNT", value: String(parts.length), type: "plain", target: ["production"] },
    ];
    const response = await fetch(`https://api.vercel.com/v10/projects/${PROJECT}/env?upsert=true&teamId=${TEAM}`, {
      method: "POST", redirect: "error", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(values), signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok || response.redirected) fail();
    const result = await response.json();
    if (Array.isArray(result?.failed) && result.failed.length) fail();
    process.stdout.write(JSON.stringify({ status: "PERSONAL_MODEL_VERCEL_CONFIGURATION_UPDATED", setupRef, partCount: parts.length }));
  } finally { token = undefined; }
}

main().catch(() => { process.stderr.write("PERSONAL_MODEL_VERCEL_CONFIGURATION_REFUSED\n"); process.exitCode = 1; });
