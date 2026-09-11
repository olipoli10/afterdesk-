import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ read: vi.fn(), stat: vi.fn(), realpath: vi.fn(), fetch: vi.fn() }));
vi.mock('node:fs', () => ({ readFileSync: io.read, lstatSync: io.stat, realpathSync: io.realpath }));
import { inspectPersonalBackendConfiguration, getPersonalBackendConfigurationDiagnostic } from '../specs/210-personal-live-activation/deployment/personal-backend-config-inspection.mjs';
const PROJECT = 'prj_cEvjMH8iJ2C9khbZ0vsQlGKQ4Y75', TEAM = 'team_txoYNQAo21jmENCfI2EG4pdP';
const ORIGIN = 'https://endvera-core-sandbox-afterdesk.vercel.app', TOKEN = 'SYNTHETIC_VERCEL_LOGIN_NEVER_REAL_1234';
const PASSWORD = 'SYNTHETIC_DATABASE_PASSWORD_NEVER_REAL';
const DIRECT = 'ep-purple-union-axj3h2t5.c-4.us-east-2.aws.neon.tech', POOL = 'ep-purple-union-axj3h2t5-pooler.c-4.us-east-2.aws.neon.tech';
const db = (host: string) => `postgresql://neondb_owner:${PASSWORD}@${host}/neondb?sslmode=require`;
let rows: { id: string; key: string; target: string[]; type: string; value?: unknown; gitBranch?: unknown }[];
let values: Record<string, unknown>;
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('APPDATA', 'C:\\synthetic-config-inspection'); vi.stubGlobal('fetch', io.fetch);
  io.read.mockReset().mockImplementation(() => Buffer.from(JSON.stringify({ token: TOKEN })));
  io.stat.mockReset().mockImplementation(() => ({ isSymbolicLink: () => false, isFile: () => true, size: 100 }));
  io.realpath.mockReset().mockImplementation(v => v);
  values = { DATABASE_URL: db(POOL), DIRECT_URL: db(DIRECT), BETTER_AUTH_SECRET: PASSWORD, CRON_SECRET: PASSWORD,
    ENDVERA_CONNECTOR_ENCRYPTION_KEY: PASSWORD, BETTER_AUTH_URL: ORIGIN, APP_URL: ORIGIN, NEXT_PUBLIC_SITE_URL: ORIGIN,
    ENDVERA_PROVIDER_WEBHOOK_ORIGIN: ORIGIN, ENDVERA_EXTERNAL_TRANSPORT_ENABLED: 'DISABLED', ENDVERA_PERSONAL_SMS_WORKER_ENABLED: 'false' };
  rows = Object.keys(values).map((key, i) => ({ id: `env_${i}`, key, target: ['production'], type: 'encrypted' }));
  io.fetch.mockReset().mockImplementation(async (url: string) => {
    if (url.includes(`/v9/projects/${PROJECT}?`)) return json({ id: PROJECT, accountId: TEAM });
    if (url.includes(`/v10/projects/${PROJECT}/env?`)) return json({ envs: rows });
    const id = new URL(url).pathname.split('/').at(-1), row = rows.find(r => r.id === id)!;
    return json({ ...row, value: values[row.key] });
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('dedicated config inspection — synthetic platform I/O only', () => {
  it('classifies local login failure without HTTP or arbitrary error disclosure', async () => {
    io.read.mockImplementation(() => { throw Error(TOKEN); });
    let caught; try { await inspectPersonalBackendConfiguration(); } catch (error) { caught = error; }
    expect(getPersonalBackendConfigurationDiagnostic(caught)).toEqual({ stage: 'LOCAL_LOGIN' });
    expect(getPersonalBackendConfigurationDiagnostic(Error(TOKEN))).toBeUndefined();
    expect(io.fetch).not.toHaveBeenCalled();
  });
  it.each([403, 200])('classifies actual HTTP%s separately from project shape without body disclosure', async status => {
    io.fetch.mockResolvedValue(new Response(JSON.stringify({ secret: TOKEN }), { status }));
    let caught; try { await inspectPersonalBackendConfiguration(); } catch (error) { caught = error; }
    const result = getPersonalBackendConfigurationDiagnostic(caught);
    expect(result).toEqual({ stage: status === 403 ? 'PROJECT_GET' : 'PROJECT_SHAPE', httpStatus: status });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
  it('GETs fixed project, production binding values and outputs only closed summaries', async () => {
    const result = await inspectPersonalBackendConfiguration(), encoded = JSON.stringify(result);
    expect(result).toMatchObject({ status: 'GET_ONLY_CONFIG_INSPECTED', projectId: PROJECT, teamId: TEAM,
      bindings: { databaseUrl: { valueReadable: true, endpointMatches: true, databaseMatches: true, roleMatches: true, requireTlsPresent: true },
        directUrl: { endpointMatches: true } }, configurationChanged: false, executionAuthorized: false, credentialsValidated: false,
      databaseConnectionVerified: false, deploymentEnvironmentVerified: false });
    expect(encoded).not.toContain(TOKEN); expect(encoded).not.toContain(PASSWORD); expect(encoded).not.toContain('postgresql');
    expect(encoded).not.toContain(ORIGIN); expect(encoded).not.toContain(DIRECT); expect(encoded).not.toContain('Sha256');
    expect(io.read).toHaveBeenCalledTimes(1); expect(io.read.mock.calls[0][0]).toMatch(/com\.vercel\.cli[\\/]Data[\\/]auth\.json$/);
    for (const [url, options] of io.fetch.mock.calls) {
      expect(new URL(url).origin).toBe('https://api.vercel.com'); expect(new URL(url).searchParams.get('teamId')).toBe(TEAM);
      expect(url).toContain(PROJECT); expect(url).not.toContain(TOKEN); expect(url).not.toContain(PASSWORD);
      expect(options).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${TOKEN}` } });
      expect(options).not.toHaveProperty('body');
    }
    const fetchedIds = io.fetch.mock.calls.map(c => new URL(c[0]).pathname.split('/').at(-1));
    for (const key of ['BETTER_AUTH_SECRET', 'CRON_SECRET', 'ENDVERA_CONNECTOR_ENCRYPTION_KEY']) expect(fetchedIds).not.toContain(rows.find(r => r.key === key)!.id);
  });
  it('does not treat presence or masked/unreadable sensitive variables as known binding', async () => {
    values.DIRECT_URL = '********'; values.DATABASE_URL = undefined;
    const result = await inspectPersonalBackendConfiguration();
    expect(result.requiredKeys.find(r => r.name === 'DIRECT_URL')?.present).toBe(true);
    expect(result.bindings.directUrl).toMatchObject({ valueReadable: false, endpointMatches: false });
    expect(result.bindings.databaseUrl.valueReadable).toBe(false);
  });
  it('does not request sensitive database values and still inspects readable flags', async () => {
    for (const r of rows) if (['DATABASE_URL', 'DIRECT_URL'].includes(r.key)) r.type = 'sensitive';
    const result = await inspectPersonalBackendConfiguration();
    expect(result.bindings.databaseUrl).toMatchObject({ present: true, sensitiveValueNotRequested: true, valueReadable: false, endpointMatches: false });
    expect(result.bindings.directUrl.sensitiveValueNotRequested).toBe(true);
    const paths = io.fetch.mock.calls.map(c => new URL(c[0]).pathname);
    for (const r of rows.filter(r => r.type === 'sensitive')) expect(paths.some(p => p.endsWith('/' + r.id))).toBe(false);
    expect(result.flags.find(f => f.name === 'ENDVERA_EXTERNAL_TRANSPORT_ENABLED')?.explicitlyOff).toBe(true);
  });
  it('flags remain separate from activation authority and unknown flags are counted only', async () => {
    values.ENDVERA_PERSONAL_SMS_WORKER_ENABLED = 'true'; rows.push({ id: 'unknown', key: 'ENDVERA_NEW_FEATURE_ENABLED', target: ['production'], type: 'plain' });
    const result = await inspectPersonalBackendConfiguration();
    expect(result.flags.find(r => r.name === 'ENDVERA_PERSONAL_SMS_WORKER_ENABLED')).toMatchObject({ explicitlyOff: false, enabledLiteralObserved: true });
    expect(result.flags.find(r => r.name === 'ENDVERA_EXTERNAL_TRANSPORT_ENABLED')).toMatchObject({ explicitlyOff: true, enabledLiteralObserved: false });
    expect(result.unclassifiedEnableSwitchCount).toBe(1); expect(JSON.stringify(result)).not.toContain('ENDVERA_NEW_FEATURE_ENABLED');
  });
  it('missing keys and absent switches remain explicit without assuming defaults', async () => {
    rows = []; const result = await inspectPersonalBackendConfiguration();
    expect(result.requiredKeys.every(r => !r.present)).toBe(true); expect(result.flags.every(r => !r.present && !r.explicitlyOff && !r.valueReadable)).toBe(true);
    expect(io.fetch).toHaveBeenCalledTimes(2);
  });
  it('preview values never satisfy production requirements or get individually fetched', async () => {
    rows = rows.map(r => ({ ...r, target: ['preview'] })); const result = await inspectPersonalBackendConfiguration();
    expect(result.requiredKeys.every(r => !r.present)).toBe(true); expect(io.fetch).toHaveBeenCalledTimes(2);
  });
  it.each(['original', 'trial', 'wrong-db', 'wrong-role', 'plaintext', 'fragment', 'duplicate-ssl', 'origin-path'])(
    'reports %s mismatch without disclosing values or assuming connection failure', async kind => {
      if (kind === 'original') values.DIRECT_URL = db('ep-morning-violet-axifrhr8.c-4.us-east-2.aws.neon.tech');
      if (kind === 'trial') values.DIRECT_URL = db('ep-crimson-violet-axmmwtjw.c-4.us-east-2.aws.neon.tech');
      if (kind === 'wrong-db') values.DIRECT_URL = db(DIRECT).replace('/neondb?', '/foreign?');
      if (kind === 'wrong-role') values.DIRECT_URL = db(DIRECT).replace('neondb_owner:', 'foreign:');
      if (kind === 'plaintext') values.DIRECT_URL = 'not-a-url'; if (kind === 'fragment') values.DIRECT_URL = db(DIRECT) + '#hidden';
      if (kind === 'duplicate-ssl') values.DIRECT_URL = db(DIRECT) + '&sslmode=disable'; if (kind === 'origin-path') values.APP_URL = ORIGIN + '/';
      const r = await inspectPersonalBackendConfiguration();
      if (['original', 'trial', 'plaintext', 'fragment'].includes(kind)) expect(r.bindings.directUrl.endpointMatches).toBe(false);
      if (kind === 'wrong-db') expect(r.bindings.directUrl.databaseMatches).toBe(false);
      if (kind === 'wrong-role') expect(r.bindings.directUrl.roleMatches).toBe(false);
      if (kind === 'duplicate-ssl') expect(r.bindings.directUrl.requireTlsPresent).toBe(false);
      if (kind === 'origin-path') expect(r.origins.find(o => o.name === 'APP_URL')?.exactOrigin).toBe(false);
      expect(r.databaseConnectionVerified).toBe(false); expect(JSON.stringify(r)).not.toContain(PASSWORD);
    });
  it.each(['project', 'team', 'http', 'pagination', 'missing-envs', 'duplicates', 'duplicate-id', 'branch', 'bad-target', 'detail-id', 'detail-key'])(
    'refuses %s instead of publishing partial inspection', async kind => {
      const original = io.fetch.getMockImplementation()!;
      io.fetch.mockImplementation(async (url: string, options: object) => {
        if (url.includes('/v9/') && ['project', 'team'].includes(kind)) return json({ id: kind === 'project' ? 'foreign' : PROJECT, accountId: kind === 'team' ? 'foreign' : TEAM });
        if (kind === 'http') return new Response(TOKEN, { status: 403 });
        if (url.includes('/v10/')) {
          if (kind === 'pagination') return json({ envs: [], pagination: { next: 1 } }); if (kind === 'missing-envs') return json({});
          if (kind === 'duplicates') return json({ envs: [...rows, { ...rows[0], id: 'other' }] });
          if (kind === 'duplicate-id') return json({ envs: [...rows, { ...rows[0], key: 'OTHER_KEY' }] });
          if (kind === 'branch') return json({ envs: [{ ...rows[0], gitBranch: 'other' }] });
          if (kind === 'bad-target') return json({ envs: [{ ...rows[0], target: ['unknown'] }] });
        }
        if (url.includes('/v1/') && kind.startsWith('detail-')) return json({ ...rows[0], id: kind === 'detail-id' ? 'other' : rows[0].id, key: kind === 'detail-key' ? 'OTHER' : rows[0].key, value: TOKEN });
        return original(url, options);
      });
      await expect(inspectPersonalBackendConfiguration()).rejects.toThrow(/^PERSONAL_BACKEND_CONFIG_INSPECTION_REFUSED$/);
    });
  it.each(['symlink', 'size', 'malformed', 'missing-token', 'token-control', 'relative-path'])(
    'refuses local login %s without a network attempt', async kind => {
      if (kind === 'symlink') io.stat.mockReturnValue({ isSymbolicLink: () => true });
      if (kind === 'size') io.stat.mockReturnValue({ isSymbolicLink: () => false, isFile: () => true, size: 65537 });
      if (kind === 'malformed') io.read.mockReturnValue(Buffer.from('BAD')); if (kind === 'missing-token') io.read.mockReturnValue(Buffer.from('{}'));
      if (kind === 'token-control') io.read.mockReturnValue(Buffer.from(JSON.stringify({ token: TOKEN + '\n' })));
      if (kind === 'relative-path') vi.stubEnv('APPDATA', '../outside');
      await expect(inspectPersonalBackendConfiguration()).rejects.toThrow(/^PERSONAL_BACKEND_CONFIG_INSPECTION_REFUSED$/); expect(io.fetch).not.toHaveBeenCalled();
    });
  it('does not disclose raw API exception strings', async () => {
    io.fetch.mockRejectedValue(Error(TOKEN + PASSWORD)); await expect(inspectPersonalBackendConfiguration()).rejects.toThrow(/^PERSONAL_BACKEND_CONFIG_INSPECTION_REFUSED$/);
  });
  it('refuses oversized streamed body', async () => {
    io.fetch.mockResolvedValue(new Response('x'.repeat(262145))); await expect(inspectPersonalBackendConfiguration()).rejects.toThrow(/^PERSONAL_BACKEND_CONFIG_INSPECTION_REFUSED$/);
  });
  it('original60s abort bounds native request waiting, with no retry', async () => {
    vi.useFakeTimers(); io.fetch.mockImplementation((_url: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error(TOKEN)))));
    const result = inspectPersonalBackendConfiguration(), refused = expect(result).rejects.toThrow(/^PERSONAL_BACKEND_CONFIG_INSPECTION_REFUSED$/);
    await vi.advanceTimersByTimeAsync(60000); await refused; expect(io.fetch).toHaveBeenCalledTimes(1);
  });
  it('wall clock rollback after GET prevents disclosure', async () => {
    let now = 10000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const original = io.fetch.getMockImplementation()!;
    io.fetch.mockImplementation(async (url: string, options: object) => { const result = await original(url, options); now--; return result; });
    await expect(inspectPersonalBackendConfiguration()).rejects.toThrow(/^PERSONAL_BACKEND_CONFIG_INSPECTION_REFUSED$/);
  });
});
