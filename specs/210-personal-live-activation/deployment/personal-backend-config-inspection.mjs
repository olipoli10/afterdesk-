// Fixed-project GET-only inspection. Never import the historical provisioner.
// No secret output, hashes, env files, child process, mutation or credential fetch
// by import. CLI-login contents are read only when the controller invokes this.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'prj_cEvjMH8iJ2C9khbZ0vsQlGKQ4Y75';
const TEAM = 'team_txoYNQAo21jmENCfI2EG4pdP';
const ORIGIN = 'https://endvera-core-sandbox-afterdesk.vercel.app';
const DIRECT = 'ep-purple-union-axj3h2t5.c-4.us-east-2.aws.neon.tech';
const POOLED = 'ep-purple-union-axj3h2t5-pooler.c-4.us-east-2.aws.neon.tech';
const REQUIRED = ['DATABASE_URL', 'DIRECT_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'CRON_SECRET', 'ENDVERA_CONNECTOR_ENCRYPTION_KEY'];
const OPTIONAL = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_PHONE_NUMBER'];
const ORIGINS = ['BETTER_AUTH_URL', 'APP_URL', 'NEXT_PUBLIC_SITE_URL', 'ENDVERA_PROVIDER_WEBHOOK_ORIGIN'];
const FLAGS = ['ENDVERA_EXTERNAL_TRANSPORT_ENABLED', 'ENDVERA_SMS_PROVIDER_ENABLED', 'ENDVERA_VOICE_PROVIDER_ENABLED', 'ENDVERA_GOOGLE_OAUTH_ENABLED',
  'ENDVERA_PERSONAL_SMS_INGRESS_ENABLED', 'ENDVERA_PERSONAL_SMS_WORKER_ENABLED', 'ENDVERA_PERSONAL_OUTBOUND_ENABLED', 'ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED',
  'ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED', 'ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED', 'ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED',
  'ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED', 'ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED', 'ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED',
  'ENDVERA_CALENDAR_SMS_CONFIRMATION_MAINTENANCE_ENABLED', 'ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED'];
const REFUSED = 'PERSONAL_BACKEND_CONFIG_INSPECTION_REFUSED';
const diagnostics = new WeakMap();
/** Only locally classified errors disclose a fixed stage and observed HTTP code.
 * Never inspect arbitrary errors, messages, properties, URLs or response bodies. */
export function getPersonalBackendConfigurationDiagnostic(error) { return diagnostics.get(error); }
const fail = () => { throw new Error(REFUSED); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const presentText = value => typeof value === 'string' && value.length > 0 && value.length <= 32768;
function readLogin() {
  const appdata = process.env.APPDATA;
  if (typeof appdata !== 'string' || !path.isAbsolute(appdata)) fail();
  const file = path.join(appdata, 'com.vercel.cli', 'Data', 'auth.json');
  for (let current = file;; current = path.dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) fail();
    if (path.dirname(current) === current) break;
  }
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > 65536 || path.resolve(realpathSync(file)) !== path.resolve(file)) fail();
  const bytes = readFileSync(file);
  try {
    if (bytes.length > 65536) fail();
    const text = bytes.toString('utf8'); if (!Buffer.from(text).equals(bytes)) fail();
    const login = JSON.parse(text);
    if (!object(login) || typeof login.token !== 'string' || !/^[A-Za-z0-9_.-]{16,8192}$/.test(login.token)) fail();
    return login.token;
  } finally { bytes.fill(0); }
}
function metadata(raw) {
  if (!object(raw) || typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.id)
    || typeof raw.key !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(raw.key)
    || !Array.isArray(raw.target) || raw.target.length < 1 || raw.target.length > 3
    || new Set(raw.target).size !== raw.target.length || raw.target.some(t => !['production', 'preview', 'development'].includes(t))) fail();
  return raw;
}
function binding(value, hostname) {
  const result = { valueReadable: presentText(value), urlShapeValid: false, endpointMatches: false, databaseMatches: false, roleMatches: false, credentialPresent: false, requireTlsPresent: false };
  if (!result.valueReadable) return result;
  try {
    const url = new URL(value);
    result.urlShapeValid = ['postgres:', 'postgresql:'].includes(url.protocol) && !url.hash && (!url.port || url.port === '5432');
    result.endpointMatches = result.urlShapeValid && url.hostname === hostname;
    result.databaseMatches = url.pathname === '/neondb'; result.roleMatches = url.username === 'neondb_owner';
    result.credentialPresent = Boolean(url.password); result.requireTlsPresent = url.searchParams.getAll('sslmode').length === 1 && url.searchParams.get('sslmode') === 'require';
  } catch { /* No invalid URL or secret is forwarded. */ }
  return result;
}

/** No caller-supplied target, path, token, request function or method. Tests mock
 * platform I/O. Inspection is project config, NOT deployed env/DB/TLS authority. */
export async function inspectPersonalBackendConfiguration() {
  let token, stage = 'LOCAL_LOGIN', httpStatus;
  const controller = new AbortController(), wall = Date.now(), mono = performance.now();
  let lastWall = wall, lastMono = mono, requests = 0;
  const timer = setTimeout(() => controller.abort(), 60000);
  const live = () => {
    const w = Date.now(), m = performance.now();
    if (!Number.isFinite(w) || !Number.isFinite(m) || w < lastWall || m < lastMono || w - wall >= 60000 || m - mono >= 60000 || controller.signal.aborted) fail();
    lastWall = w; lastMono = m;
  };
  try {
    live(); token = readLogin(); live();
    const get = async endpoint => {
      live(); if (++requests > 30) fail();
      // All callers below generate one of three fixed-project GET paths.
      const response = await fetch(`https://api.vercel.com${endpoint}${endpoint.includes('?') ? '&' : '?'}teamId=${TEAM}`, {
        method: 'GET', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: controller.signal,
      });
      if (response instanceof Response && Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) httpStatus = response.status;
      live(); if (!response.ok || !response.body || response.redirected) fail();
      const length = response.headers.get('content-length'); if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > 262144)) fail();
      const reader = response.body.getReader(); let size = 0, chunks = 0; const parts = [];
      try {
        for (;;) {
          const next = await reader.read(); live(); if (next.done) break;
          if (!(next.value instanceof Uint8Array) || ++chunks > 256 || (size += next.value.byteLength) > 262144) fail();
          parts.push(Buffer.from(next.value));
        }
        const bytes = Buffer.concat(parts);
        try { const text = bytes.toString('utf8'); if (!Buffer.from(text).equals(bytes)) fail(); return JSON.parse(text); }
        finally { bytes.fill(0); }
      } finally { parts.forEach(p => p.fill(0)); void reader.cancel().catch(() => {}); reader.releaseLock(); }
    };
    stage = 'PROJECT_GET'; httpStatus = undefined;
    const project = await get(`/v9/projects/${PROJECT}`);
    stage = 'PROJECT_SHAPE';
    if (!object(project) || project.id !== PROJECT || project.accountId !== TEAM) fail();
    stage = 'ENV_LIST_GET'; httpStatus = undefined;
    const list = await get(`/v10/projects/${PROJECT}/env`);
    stage = 'ENV_LIST_SHAPE';
    if (!object(list) || !Array.isArray(list.envs) || list.envs.length > 256 || (list.pagination?.next !== undefined && list.pagination.next !== null)) fail();
    const envs = new Map(), ids = new Set();
    for (const item of list.envs) {
      const e = metadata(item); if (ids.has(e.id)) fail(); ids.add(e.id);
      if (!e.target.includes('production')) continue;
      if (e.gitBranch !== undefined && e.gitBranch !== null || e.customEnvironmentIds?.length || envs.has(e.key)) fail();
      envs.set(e.key, { id: e.id, key: e.key, type: e.type });
    }
    const values = new Map();
    for (const key of ['DATABASE_URL', 'DIRECT_URL', ...ORIGINS, ...FLAGS]) {
      const e = envs.get(key); if (!e) continue;
      // Deliberate local policy, not a guess about an HTTP failure: sensitive
      // values are never requested. Their presence does not verify their URL.
      if (e.type === 'sensitive') continue;
      stage = 'ENV_DETAIL_GET'; httpStatus = undefined;
      const result = await get(`/v1/projects/${PROJECT}/env/${e.id}`);
      stage = 'ENV_DETAIL_SHAPE';
      if (!object(result) || result.id !== e.id || result.key !== key || !Array.isArray(result.target)
        || !result.target.includes('production') || (result.gitBranch !== undefined && result.gitBranch !== null) || result.customEnvironmentIds?.length) fail();
      // Sensitive values may be non-retrievable. Never infer a decrypted value
      // from list metadata, placeholders or their presence alone.
      values.set(key, typeof result.value === 'string' && !/^\*+$/.test(result.value) ? result.value : undefined);
    }
    live();
    const flags = FLAGS.map(name => ({ name, present: envs.has(name), valueReadable: presentText(values.get(name)),
      explicitlyOff: values.get(name) === 'false' || values.get(name) === 'DISABLED',
      enabledLiteralObserved: values.get(name) === 'true' || values.get(name) === 'ENABLED' }));
    return Object.freeze({ version: 'personal-backend-config-inspection-v1', status: 'GET_ONLY_CONFIG_INSPECTED', projectId: PROJECT, teamId: TEAM,
      bindings: {
        databaseUrl: { present: envs.has('DATABASE_URL'), sensitiveValueNotRequested: envs.get('DATABASE_URL')?.type === 'sensitive', ...binding(values.get('DATABASE_URL'), POOLED) },
        directUrl: { present: envs.has('DIRECT_URL'), sensitiveValueNotRequested: envs.get('DIRECT_URL')?.type === 'sensitive', ...binding(values.get('DIRECT_URL'), DIRECT) },
      },
      origins: ORIGINS.map(name => ({ name, present: envs.has(name), valueReadable: presentText(values.get(name)), exactOrigin: values.get(name) === ORIGIN })),
      requiredKeys: REQUIRED.map(name => ({ name, present: envs.has(name) })), optionalKeys: OPTIONAL.map(name => ({ name, present: envs.has(name) })), flags,
      unclassifiedEnableSwitchCount: [...envs.keys()].filter(key => key.startsWith('ENDVERA_') && key.endsWith('_ENABLED') && !FLAGS.includes(key)).length,
      deploymentEnvironmentVerified: false, databaseConnectionVerified: false, credentialsValidated: false, executionAuthorized: false, configurationChanged: false });
  } catch {
    const error = new Error(REFUSED);
    diagnostics.set(error, Object.freeze({ stage, ...(httpStatus === undefined ? {} : { httpStatus }) }));
    throw error;
  }
  finally { token = undefined; clearTimeout(timer); controller.abort(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) fail();
    process.stdout.write(JSON.stringify(await inspectPersonalBackendConfiguration()) + '\n');
  } catch (error) {
    const diagnostic = getPersonalBackendConfigurationDiagnostic(error);
    process.stderr.write((diagnostic ? JSON.stringify({ status: REFUSED, ...diagnostic }) : REFUSED) + '\n'); process.exitCode = 1;
  }
}
