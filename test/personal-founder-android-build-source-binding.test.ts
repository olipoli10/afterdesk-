import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFounderAndroidBuildInputs } from '../scripts/check-founder-android-inputs.mjs';

// Real local Git and real source binding. No mocks, no EAS, no remote, no install.
// Every git mutation is scoped to this test-created temporary checkout only.
const SOURCE_ROOT = process.cwd();
const ORIGIN = 'https://endvera-core-sandbox-afterdesk.vercel.app';
const FILES = ['apps/mobile/app.json', 'apps/mobile/eas.json', 'apps/mobile/package.json',
  'release/endvera-construction-v1/release-definition-v3.json', 'release/endvera-construction-v1/mobile-build-readiness.json',
  'scripts/check-founder-android-inputs.mjs', 'scripts/start-founder-android-build-secure.ps1',
  'scripts/endvera-mobile-build-contract.mjs', 'scripts/endvera-release-source-binding.mjs'];
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const allocated = new Set<string>();

function withFixture(run: (fixture: ReturnType<typeof initialize>) => void) {
  const container = mkdtempSync(resolve(tmpdir(), 'personal-founder-git-'));
  allocated.add(container);
  try { run(initialize(container)); }
  finally {
    const absolute = resolve(container), parent = resolve(tmpdir());
    const real = realpathSync(absolute), realParent = realpathSync(parent);
    if (!allocated.has(container) || dirname(absolute) !== parent || !/^personal-founder-git-[A-Za-z0-9]+$/.test(basename(absolute))
      || lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isDirectory()
      || dirname(real) !== realParent || relative(realParent, real).includes('..')) throw new Error('TEST_CLEANUP_SCOPE_INVALID');
    rmSync(absolute, { recursive: true, force: false });
    allocated.delete(container);
    expect(existsSync(absolute)).toBe(false);
  }
}

function initialize(container: string) {
  const root = resolve(container, 'checkout'); mkdirSync(root);
  const emptyTemplate = resolve(container, 'empty-template'); mkdirSync(emptyTemplate);
  const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', '-C', root,
    '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${resolve(container, 'no-hooks')}`,
    '-c', 'commit.gpgsign=false', '-c', 'user.name=Founder Guard Synthetic Test',
    '-c', 'user.email=founder-guard@example.invalid', ...args],
  { encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','pipe'], timeout: 5000, maxBuffer: 1048576 }).trim();
  const write = (file: string, contents: string | Buffer) => {
    const target = resolve(root, file), within = relative(root, target);
    if (isAbsolute(within) || within.startsWith('..')) throw new Error('TEST_WRITE_SCOPE_INVALID');
    mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, contents);
  };
  git('init', '--quiet', '--initial-branch=synthetic-fixture', '--object-format=sha1', `--template=${emptyTemplate}`);
  git('config', '--local', 'core.autocrlf', 'false');
  for (const file of FILES) write(file, readFileSync(resolve(SOURCE_ROOT, file), 'utf8').replaceAll('\r\n', '\n'));
  const eas = JSON.parse(readFileSync(resolve(root, 'apps/mobile/eas.json'), 'utf8'));
  eas.build['founder-device'].env = { EXPO_PUBLIC_ENDVERA_API_URL: ORIGIN };
  write('apps/mobile/eas.json', JSON.stringify(eas, null, 2) + '\n');
  write('.gitattributes', '*.ps1 text eol=crlf\n');
  write('.gitignore', 'apps/mobile/app.config.ts\n');
  write('src/synthetic-tracked.ts', 'export const synthetic = 1;\n');
  git('add', '--', '.');
  git('commit', '--quiet', '-m', 'Synthetic founder input fixture only');
  const head = git('rev-parse', 'HEAD');
  const versionCode = JSON.parse(readFileSync(resolve(root, 'apps/mobile/app.json'), 'utf8')).expo.android.versionCode as number;
  const expected = { expectedHead: head, expectedApiOrigin: ORIGIN, expectedVersionCode: versionCode };
  const check = () => checkFounderAndroidBuildInputs(expected, { repositoryRoot: root });
  return { root, git, write, head, expected, check };
}

describe('founder guard with real clean temporary Git source (no mocked authority)', () => {
  it('accepts the actual clean source binding without changing HEAD, index bytes or public input bytes', () => withFixture(f => {
    expect(f.git('status', '--porcelain=v1', '--untracked-files=all')).toBe('');
    const indexBefore = readFileSync(resolve(f.root, '.git/index'));
    const hashesBefore = FILES.map(file => sha(readFileSync(resolve(f.root, file))));
    const result = f.check();
    expect(result).toMatchObject({ status: 'FOUNDER_ANDROID_INPUTS_VALIDATED_LOCAL_ONLY', sourceHead: f.head,
      trackedSourceBindingVerified: true, apiOrigin: ORIGIN, versionCode: f.expected.expectedVersionCode,
      executionAuthorized: false, backendCompatibilityVerified: false, remoteEasConfigurationVerified: false, budgetVerified: false, buildInvoked: false });
    expect(f.git('rev-parse', 'HEAD')).toBe(f.head);
    expect(readFileSync(resolve(f.root, '.git/index')).equals(indexBefore)).toBe(true);
    expect(FILES.map(file => sha(readFileSync(resolve(f.root, file))))).toEqual(hashesBefore);
    expect(f.git('status', '--porcelain=v1', '--untracked-files=all')).toBe('');
  }), 20000);

  it('refuses changed source between two real preflight calls', () => withFixture(f => {
    expect(f.check().trackedSourceBindingVerified).toBe(true);
    const file = resolve(f.root, 'apps/mobile/eas.json');
    f.write('apps/mobile/eas.json', readFileSync(file, 'utf8') + ' ');
    expect(f.git('status', '--porcelain=v1')).toContain('apps/mobile/eas.json');
    expect(() => f.check()).toThrow('FOUNDER_ANDROID_DIRTY_GIT');
    expect(f.git('rev-parse', 'HEAD')).toBe(f.head);
  }), 20000);

  it('refuses a real untracked file after a successful clean check', () => withFixture(f => {
    expect(f.check().trackedSourceBindingVerified).toBe(true);
    f.write('apps/mobile/untracked-synthetic.txt', 'synthetic, never uploaded\n');
    expect(f.git('status', '--porcelain=v1', '--untracked-files=all')).toContain('?? apps/mobile/untracked-synthetic.txt');
    expect(() => f.check()).toThrow('FOUNDER_ANDROID_DIRTY_GIT');
  }), 20000);

  it.each(['--assume-unchanged', '--skip-worktree'])('refuses hidden tracked non-input mutation under %s', flag => withFixture(f => {
    expect(f.check().trackedSourceBindingVerified).toBe(true);
    f.git('update-index', flag, '--', 'src/synthetic-tracked.ts');
    f.write('src/synthetic-tracked.ts', 'export const synthetic = 2;\n');
    // The positive empty status is required: otherwise this would test only
    // Git's dirty check instead of the actual whole-checkout source authority.
    expect(f.git('status', '--porcelain=v1', '--untracked-files=all')).toBe('');
    expect(() => f.check()).toThrow('FOUNDER_ANDROID_LOCAL_INPUTS_REFUSED');
  }), 20000);

  it('accepts the actual Git-classified PS1 CRLF checkout without changing its source commit', () => withFixture(f => {
    const file = 'scripts/start-founder-android-build-secure.ps1';
    // Establish a real normalized checkout/index pair in this fixture only.
    // A manual rewrite initially remained dirty before invoking the guard.
    f.git('config', '--local', 'core.autocrlf', 'true');
    const lf = readFileSync(resolve(f.root, file), 'utf8').replaceAll('\r\n', '\n');
    f.write(file, lf.replaceAll('\n', '\r\n'));
    f.git('add', '--renormalize', '--', file);
    expect(f.git('diff', '--cached', '--name-only')).toBe('');
    expect(f.git('ls-files', '--eol', '--', file)).toMatch(/i\/lf\s+w\/crlf/);
    expect(f.git('status', '--porcelain=v1')).toBe('');
    expect(f.check().trackedSourceBindingVerified).toBe(true);
    expect(f.git('rev-parse', 'HEAD')).toBe(f.head);
  }), 20000);

  it('refuses an ignored dynamic app config despite real clean Git status', () => withFixture(f => {
    f.write('apps/mobile/app.config.ts', 'throw new Error("must never execute");\n');
    expect(f.git('status', '--porcelain=v1', '--untracked-files=all')).toBe('');
    expect(() => f.check()).toThrow('FOUNDER_ANDROID_DYNAMIC_APP_CONFIG');
  }), 20000);

  it('refuses a different actual committed HEAD rather than adopting it automatically', () => withFixture(f => {
    f.write('src/synthetic-tracked.ts', 'export const synthetic = 3;\n');
    f.git('add', '--', 'src/synthetic-tracked.ts');
    f.git('commit', '--quiet', '-m', 'Second synthetic fixture commit only');
    expect(f.git('rev-parse', 'HEAD')).not.toBe(f.head);
    expect(f.git('status', '--porcelain=v1')).toBe('');
    expect(() => f.check()).toThrow('FOUNDER_ANDROID_HEAD_CHANGED');
  }), 20000);
});
