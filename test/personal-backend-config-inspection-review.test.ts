import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ read: vi.fn(), stat: vi.fn(), realpath: vi.fn(), fetch: vi.fn() }));
vi.mock('node:fs', () => ({ readFileSync: io.read, lstatSync: io.stat, realpathSync: io.realpath }));
import { inspectPersonalBackendConfiguration, getPersonalBackendConfigurationDiagnostic } from '../specs/210-personal-live-activation/deployment/personal-backend-config-inspection.mjs';

// Independent synthetic platform fixture: no real credential file or HTTP call.
const PROJECT = 'prj_cEvjMH8iJ2C9khbZ0vsQlGKQ4Y75', TEAM = 'team_txoYNQAo21jmENCfI2EG4pdP';
const SECRET = 'SYNTHETIC_PEER_TOKEN_NEVER_REAL_5678';
const json = (v: unknown) => new Response(JSON.stringify(v));
let rows: { id: string; key: string; target: string[]; type: string }[];
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('fetch', io.fetch); vi.stubEnv('APPDATA', 'C:\\synthetic-peer-config');
  io.read.mockImplementation(() => Buffer.from(JSON.stringify({ token: SECRET })));
  io.stat.mockReturnValue({ isSymbolicLink: () => false, isFile: () => true, size: 100 });
  io.realpath.mockImplementation(v => v);
  rows = [{ id: 'flag', key: 'ENDVERA_EXTERNAL_TRANSPORT_ENABLED', target: ['production'], type: 'encrypted' }];
  io.fetch.mockImplementation(async (url: string) => {
    if (url.includes('/v9/')) return json({ id: PROJECT, accountId: TEAM });
    if (url.includes('/v10/')) return json({ envs: rows });
    return json({ ...rows[0], value: 'DISABLED' });
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('peer config inspection boundaries — mocked I/O only', () => {
  it('refuses a detail whose custom scope changed after production listing', async () => {
    const original = io.fetch.getMockImplementation()!;
    io.fetch.mockImplementation(async (url: string) => url.includes('/v1/')
      ? json({ ...rows[0], customEnvironmentIds: ['other-scope'], value: 'DISABLED' }) : original(url));
    await expect(inspectPersonalBackendConfiguration()).rejects.toThrow(/^PERSONAL_BACKEND_CONFIG_INSPECTION_REFUSED$/);
    expect(io.fetch).toHaveBeenCalledTimes(3);
  });
  it('rejects a response-supplied path before any detail GET', async () => {
    rows[0].id = '../foreign?teamId=other';
    await expect(inspectPersonalBackendConfiguration()).rejects.toThrow(/^PERSONAL_BACKEND_CONFIG_INSPECTION_REFUSED$/);
    expect(io.fetch).toHaveBeenCalledTimes(2);
    for (const [url, options] of io.fetch.mock.calls) {
      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://api.vercel.com'); expect(parsed.search).toBe(`?teamId=${TEAM}`);
      expect(parsed.pathname).toMatch(new RegExp(`^/v(?:9|10)/projects/${PROJECT}(?:/env)?$`));
      expect(options.method).toBe('GET'); expect(options.redirect).toBe('error');
    }
  });
  it('body failures disclose only registered stage/status; forged diagnostics are ignored', async () => {
    const foreign = Object.assign(Error(SECRET), { stage: SECRET, httpStatus: 403 });
    io.fetch.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.error(foreign); } })));
    let caught: unknown;
    try { await inspectPersonalBackendConfiguration(); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error); expect((caught as Error).message).toBe('PERSONAL_BACKEND_CONFIG_INSPECTION_REFUSED');
    expect(getPersonalBackendConfigurationDiagnostic(caught)).toEqual({ stage: 'PROJECT_GET', httpStatus: 200 });
    expect(getPersonalBackendConfigurationDiagnostic(foreign)).toBeUndefined();
    expect(getPersonalBackendConfigurationDiagnostic({ stage: 'PROJECT_GET', httpStatus: 200 })).toBeUndefined();
    expect(JSON.stringify(getPersonalBackendConfigurationDiagnostic(caught))).not.toContain(SECRET);
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });
  it('sensitive flags and origins remain unknown and are never requested individually', async () => {
    rows[0].type = 'sensitive';
    rows.push({ id: 'origin', key: 'APP_URL', target: ['production'], type: 'sensitive' });
    const result = await inspectPersonalBackendConfiguration();
    expect(result.flags.find(f => f.name === rows[0].key)).toMatchObject({ present: true, valueReadable: false, explicitlyOff: false, enabledLiteralObserved: false });
    expect(result.origins.find(o => o.name === 'APP_URL')).toEqual({ name: 'APP_URL', present: true, valueReadable: false, exactOrigin: false });
    expect(result.executionAuthorized).toBe(false); expect(result.configurationChanged).toBe(false);
    expect(io.fetch).toHaveBeenCalledTimes(2); expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
