import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({ git: vi.fn(), binding: vi.fn(), read: vi.fn(), stat: vi.fn() }));
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), execFileSync: spies.git }));
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, readFileSync: (...args: Parameters<typeof actual.readFileSync>) => spies.read(...args) ?? actual.readFileSync(...args),
    lstatSync: (...args: Parameters<typeof actual.lstatSync>) => spies.stat(...args) ?? actual.lstatSync(...args) };
});
vi.mock('../scripts/endvera-release-source-binding.mjs', async original => ({ ...await original<object>(), assertReleaseSourceBinding: spies.binding }));

import { checkFounderAndroidBuildInputs, validateFounderAndroidBuildInputs } from '../scripts/check-founder-android-inputs.mjs';

const HEAD = 'a'.repeat(40), ORIGIN = 'https://endvera-core-sandbox-afterdesk.vercel.app';
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const actual = { app: json('apps/mobile/app.json'), eas: json('apps/mobile/eas.json'), packageJson: json('apps/mobile/package.json'),
  definition: json('release/endvera-construction-v1/release-definition-v3.json'), readiness: json('release/endvera-construction-v1/mobile-build-readiness.json') };
const expected = { expectedHead: HEAD, expectedApiOrigin: ORIGIN, expectedVersionCode: 6 };
function fixture() {
  const value = { ...structuredClone(actual), ...expected, head: HEAD, gitStatus: '' };
  // Source inputs are real; HEAD/clean state remain synthetic observations.
  return value;
}
const launch = readFileSync('scripts/start-founder-android-build-secure.ps1', 'utf8').replaceAll('\r\n', '\n');

beforeEach(() => {
  vi.clearAllMocks(); spies.read.mockReset(); spies.stat.mockReset(); spies.git.mockReset(); spies.binding.mockReset();
  spies.git.mockImplementation((_exe: string, args: string[]) => Buffer.from(args.includes('status') ? '' : args.some(x => x.endsWith('^{tree}')) ? 'b'.repeat(40) + '\n' : HEAD + '\n'));
  spies.binding.mockReturnValue({ trackedCheckoutMatchesSource: true });
});
afterEach(() => vi.restoreAllMocks());

describe('founder Android guard — pure supplied fixtures only', () => {
  it('validates a coherent synthetic control without declaring backend, EAS, budget or build authority', () => {
    const result = validateFounderAndroidBuildInputs(fixture());
    expect(result).toMatchObject({ status: 'FOUNDER_ANDROID_INPUTS_VALIDATED_LOCAL_ONLY', sourceHead: HEAD, apiOrigin: ORIGIN,
      versionCode: 6, semanticVersion: actual.app.expo.version, profile: 'founder-device', executionAuthorized: false,
      backendCompatibilityVerified: false, remoteEasConfigurationVerified: false, budgetVerified: false, buildInvoked: false });
    expect(Object.isFrozen(result)).toBe(true);
    expect(spies.git).not.toHaveBeenCalled(); expect(spies.binding).not.toHaveBeenCalled();
  });

  it('pins the current source origin without granting remote or build authority', () => {
    expect(actual.eas.build['founder-device'].env).toEqual({ EXPO_PUBLIC_ENDVERA_API_URL: ORIGIN });
    expect(validateFounderAndroidBuildInputs({ ...structuredClone(actual), ...expected, head: HEAD, gitStatus: '' })).toMatchObject({ versionCode: 6, buildInvoked: false, backendCompatibilityVerified: false });
  });

  it.each(['', 'http://endvera-core-sandbox-afterdesk.vercel.app', ORIGIN + '/', ORIGIN + '/api', ORIGIN + '?secret=x', ORIGIN + '#x',
    'https://user:password@endvera-core-sandbox-afterdesk.vercel.app', 'https://other.vercel.app', ORIGIN + ':443', ' ' + ORIGIN])(
    'refuses non-exact controller origin %s', origin => {
      const value = fixture(); value.expectedApiOrigin = origin;
      expect(() => validateFounderAndroidBuildInputs(value)).toThrow('EXPECTED_ORIGIN');
    },
  );

  it.each(['missing','mismatch','secret','unrelated','cloudEnvironment','inherited'])('refuses %s source-origin/profile ambiguity', kind => {
    const value = fixture(), profile = value.eas.build['founder-device'];
    if (kind === 'missing') delete profile.env;
    if (kind === 'mismatch') profile.env.EXPO_PUBLIC_ENDVERA_API_URL = 'https://other.invalid';
    if (kind === 'secret') profile.env.EXPO_TOKEN = 'synthetic-never-output';
    if (kind === 'unrelated') profile.env.UNRELATED = 'x';
    if (kind === 'cloudEnvironment') profile.environment = 'preview';
    if (kind === 'inherited') profile.extends = 'internal-preview';
    expect(() => validateFounderAndroidBuildInputs(value)).toThrow(/FOUNDER_PROFILE|PROFILE_ORIGIN/);
  });

  it.each(['head','dirty','project','owner','package','code','semantic','packageVersion','release','readiness','profile','store','autoincrement'])(
    'refuses %s mismatch without changing the supplied source', kind => {
      const value = fixture();
      if (kind === 'head') value.head = 'c'.repeat(40);
      if (kind === 'dirty') value.gitStatus = ' M apps/mobile/app.json\0';
      if (kind === 'project') value.app.expo.extra.eas.projectId = '00000000-0000-4000-8000-000000000000';
      if (kind === 'owner') value.app.expo.owner = 'someone-else';
      if (kind === 'package') value.app.expo.android.package = 'ai.other.mobile';
      if (kind === 'code') value.app.expo.android.versionCode = 7;
      if (kind === 'semantic') value.app.expo.version = '0.3.0';
      if (kind === 'packageVersion') value.packageJson.version = '0.3.0';
      if (kind === 'release') value.definition.identities.find((x: {target: string}) => x.target === 'ANDROID').versionCode = 7;
      if (kind === 'readiness') value.readiness.android.versionCode = 7;
      if (kind === 'profile') delete value.eas.build['founder-device'];
      if (kind === 'store') value.eas.build['founder-device'].distribution = 'store';
      if (kind === 'autoincrement') value.eas.build['founder-device'].autoIncrement = true;
      const before = JSON.stringify(value); expect(() => validateFounderAndroidBuildInputs(value)).toThrow(/^FOUNDER_ANDROID_/);
      expect(JSON.stringify(value)).toBe(before);
    },
  );

  it.each([0, -1, 1.5, 2100000001, '4'])('rejects invalid controller version %s', version => {
    const value = fixture(); Object.assign(value, { expectedVersionCode: version });
    expect(() => validateFounderAndroidBuildInputs(value)).toThrow('EXPECTED_VERSION');
  });

  it('rejects accessors before invocation, prototype pollution and oversized sparse input', () => {
    const value = fixture(); let calls = 0;
    Object.defineProperty(value, 'head', { enumerable: true, get() { calls++; return HEAD; } });
    expect(() => validateFounderAndroidBuildInputs(value)).toThrow('INPUT_ACCESSOR'); expect(calls).toBe(0);
    const extra = fixture(); Object.defineProperty(extra.eas, '__proto__', { value: {}, enumerable: true });
    expect(() => validateFounderAndroidBuildInputs(extra)).toThrow('INPUT_SHAPE');
    const sparse = fixture(); sparse.definition.identities = Array(20000);
    expect(() => validateFounderAndroidBuildInputs(sparse)).toThrow('INPUT_BOUND');
  });
});

describe('read-only runner ordering with explicit mocked local observations (not real source binding)', () => {
  const syntheticEas = () => {
    const bytes = Buffer.from(JSON.stringify(fixture().eas));
    spies.read.mockImplementation((file: unknown) => String(file).endsWith('apps\\mobile\\eas.json') || String(file).endsWith('apps/mobile/eas.json') ? bytes : undefined);
    return bytes;
  };
  it('rechecks HEAD and clean status around the existing full source-binding call', () => {
    syntheticEas(); const result = checkFounderAndroidBuildInputs(expected, { repositoryRoot: process.cwd() });
    expect(result.trackedSourceBindingVerified).toBe(true); expect(result.buildInvoked).toBe(false);
    expect(spies.binding).toHaveBeenCalledOnce();
    expect(spies.binding.mock.calls[0][0].manifest.source.head).toBe(HEAD);
    expect(spies.git.mock.calls.filter(([, args]) => args.includes('status'))).toHaveLength(2);
    expect(spies.git.mock.calls.every(([exe, , options]) => exe === 'git' && options.timeout === 30000)).toBe(true);
    expect(spies.git.mock.calls.every(([, args]) => args.includes('--no-optional-locks') && args.includes('core.fsmonitor=false'))).toBe(true);
  });
  it('refuses changed HEAD or dirty tree before reading source files', () => {
    spies.git.mockReturnValueOnce(Buffer.from('c'.repeat(40)));
    expect(() => checkFounderAndroidBuildInputs(expected)).toThrow('HEAD_CHANGED'); expect(spies.read).not.toHaveBeenCalled();
    spies.git.mockImplementation((_exe: string, args: string[]) => Buffer.from(args.includes('status') ? ' M changed\0' : HEAD));
    expect(() => checkFounderAndroidBuildInputs(expected)).toThrow('DIRTY_GIT'); expect(spies.binding).not.toHaveBeenCalled();
  });
  it('refuses a source mutation during binding even when mocked Git still claims clean', () => {
    const bytes = syntheticEas(); let after = false;
    spies.binding.mockImplementation(() => { after = true; });
    spies.read.mockImplementation((file: unknown) => String(file).endsWith('eas.json') ? after ? Buffer.from(bytes.toString() + ' ') : bytes : undefined);
    expect(() => checkFounderAndroidBuildInputs(expected)).toThrow('SOURCE_CHANGED');
  });
  it('does not reuse an earlier successful preflight after the source changes', () => {
    syntheticEas(); expect(checkFounderAndroidBuildInputs(expected).buildInvoked).toBe(false);
    const missingOrigin = fixture().eas; delete missingOrigin.build['founder-device'].env;
    spies.read.mockImplementation((file: unknown) => String(file).endsWith('eas.json') ? Buffer.from(JSON.stringify(missingOrigin)) : undefined);
    expect(() => checkFounderAndroidBuildInputs(expected)).toThrow('FOUNDER_PROFILE');
  });
  it('refuses hidden dynamic config and source-binding errors without echoing their text', () => {
    syntheticEas(); spies.stat.mockImplementation((file: unknown) => String(file).endsWith('app.config.ts') ? {} : undefined);
    expect(() => checkFounderAndroidBuildInputs(expected)).toThrow('DYNAMIC_APP_CONFIG');
    spies.stat.mockReset(); spies.binding.mockImplementation(() => { throw new Error('synthetic-secret-must-not-appear'); });
    expect(() => checkFounderAndroidBuildInputs(expected)).toThrow('FOUNDER_ANDROID_LOCAL_INPUTS_REFUSED');
  });
});

describe('closed CLI and launcher — never invoke EAS in tests', () => {
  it('returns only an opaque fixed refusal for arbitrary CLI values', () => {
    const marker = 'synthetic-secret-must-not-appear';
    const result = spawnSync(process.execPath, [resolve('scripts/check-founder-android-inputs.mjs'), '--expected-head', marker,
      '--expected-api-origin', ORIGIN, '--expected-version-code', '4'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    expect(result.status).toBe(1); expect(result.stdout).toBe(''); expect(result.stderr.trim()).toBe('FOUNDER_ANDROID_EXPECTED_HEAD');
    expect(result.stderr).not.toContain(marker);
  });
  it('uses the gate before both fixed EAS calls and has no init/login/git mutation/store submission', () => {
    expect(launch).toContain('Assert-FounderBuildInputs\n  $cliOutput = @(& npx');
    expect(launch).toContain('Invoke-FounderEas whoami');
    expect(launch).toContain('Invoke-FounderEas build --platform android --profile founder-device --non-interactive --wait');
    expect(launch).not.toMatch(/project:init|Invoke-Eas login|git\s+(?:add|commit|push)|--auto-submit|--profile store/);
    expect(launch).not.toMatch(/\$Arguments -join|Write-Host.*\$account|Write-Output.*\$cliOutput/);
    expect(launch).toContain('FOUNDER_ANDROID_BUILD_STOPPED_NO_AUTOMATIC_RETRY');
  });
});
