import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { assertReleaseRegularFile, assertReleaseSourceBinding } from './endvera-release-source-binding.mjs';
import { validateMobileBuildPreparation } from './endvera-mobile-build-contract.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ORIGIN = 'https://endvera-core-sandbox-afterdesk.vercel.app';
const PROJECT = 'a7b2c087-f8e1-48e4-8798-f6fabefb69fe';
const ENV_KEY = 'EXPO_PUBLIC_ENDVERA_API_URL';
const INPUTS = Object.freeze({ app: 'apps/mobile/app.json', eas: 'apps/mobile/eas.json', packageJson: 'apps/mobile/package.json',
  definition: 'release/endvera-construction-v1/release-definition-v3.json', readiness: 'release/endvera-construction-v1/mobile-build-readiness.json' });
const SOURCE_FILES = Object.freeze([...Object.values(INPUTS), 'scripts/check-founder-android-inputs.mjs',
  'scripts/start-founder-android-build-secure.ps1', 'scripts/endvera-mobile-build-contract.mjs', 'scripts/endvera-release-source-binding.mjs']);
/** @returns {never} */
const fail = code => { throw new Error(`FOUNDER_ANDROID_${code}`); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function snapshotJson(value) {
  let bytes = 0, nodes = 0;
  const visit = (v, depth) => {
    if (++nodes > 10000 || depth > 16) fail('INPUT_BOUND');
    if (typeof v === 'string') {
      if (v.length > 65536 || v.includes('\0') || Buffer.from(v).toString('utf8') !== v) fail('INPUT_STRING');
      bytes += Buffer.byteLength(v) + 8; if (bytes > 1048576) fail('INPUT_BOUND'); return v;
    }
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return v;
    if (!v || typeof v !== 'object' || types.isProxy(v)) fail('INPUT_SHAPE');
    const array = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype)) fail('INPUT_SHAPE');
    const size = array ? Object.getOwnPropertyDescriptor(v, 'length')?.value : undefined;
    if (array && (!Number.isSafeInteger(size) || size < 0 || size > 512)) fail('INPUT_BOUND');
    const keys = Reflect.ownKeys(v);
    if (keys.length > 513 || (array && keys.length !== size + 1)) fail('INPUT_BOUND');
    const out = array ? [] : {};
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || key === '__proto__' || (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= size))) fail('INPUT_SHAPE');
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!d?.enumerable || !('value' in d)) fail('INPUT_ACCESSOR');
      visit(key, depth + 1);
      Object.defineProperty(out, key, { value: visit(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return out;
  };
  return visit(value, 0);
}
const exactKeys = (object, keys) => object && !Array.isArray(object) && typeof object === 'object'
  && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
function expectations(raw) {
  const value = snapshotJson(raw);
  if (!exactKeys(value, ['expectedHead','expectedApiOrigin','expectedVersionCode'])) fail('EXPECTED_INPUTS');
  if (typeof value.expectedHead !== 'string' || !/^[a-f0-9]{40}$/.test(value.expectedHead)) fail('EXPECTED_HEAD');
  // No URL normalization: paths, ports, credentials, fragments and alternate hosts
  // must not become the approved origin merely because URL.origin matches.
  if (value.expectedApiOrigin !== ORIGIN) fail('EXPECTED_ORIGIN');
  if (!Number.isSafeInteger(value.expectedVersionCode) || value.expectedVersionCode < 1 || value.expectedVersionCode > 2100000000) fail('EXPECTED_VERSION');
  return value;
}

/** Pure comparison of supplied local observations; never remote/build authority. */
export function validateFounderAndroidBuildInputs(raw) {
  const value = snapshotJson(raw);
  if (!exactKeys(value, ['expectedHead','expectedApiOrigin','expectedVersionCode','head','gitStatus',...Object.keys(INPUTS)])) fail('INPUT_FIELDS');
  const expected = expectations({ expectedHead: value.expectedHead, expectedApiOrigin: value.expectedApiOrigin, expectedVersionCode: value.expectedVersionCode });
  if (value.head !== expected.expectedHead) fail('HEAD_CHANGED');
  if (value.gitStatus !== '') fail('DIRTY_GIT');
  const app = value.app?.expo, eas = value.eas, pkg = value.packageJson;
  if (!app || app.name !== 'ENDVERA' || app.slug !== 'endvera' || app.scheme !== 'endvera' || app.owner !== 'endveras-team'
    || app.extra?.eas?.projectId !== PROJECT || app.android?.package !== 'ai.endvera.mobile'
    || app.android?.versionCode !== expected.expectedVersionCode || pkg?.name !== '@endvera/mobile' || pkg.main !== 'index.js'
    || typeof app.version !== 'string' || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(app.version) || pkg.version !== app.version) fail('APP_IDENTITY');
  const identities = value.definition?.identities;
  const android = Array.isArray(identities) ? identities.filter(item => item?.target === 'ANDROID') : [];
  if (android.length !== 1 || android[0].semanticVersion !== app.version || android[0].versionCode !== app.android.versionCode
    || android[0].package !== app.android.package || android[0].appName !== app.name || android[0].slug !== app.slug || android[0].scheme !== app.scheme) fail('RELEASE_IDENTITY');
  if (!exactKeys(eas, ['cli','build']) || !exactKeys(eas.cli, ['appVersionSource','requireCommit','promptToConfigurePushNotifications'])
    || eas.cli.promptToConfigurePushNotifications !== false) fail('BUILD_CONFIG');
  const profile = eas.build?.['founder-device'];
  if (!exactKeys(profile, ['distribution','autoIncrement','ios','android','env']) || !exactKeys(profile.android, ['buildType'])
    || !exactKeys(profile.ios, ['simulator'])) fail('FOUNDER_PROFILE');
  if (!exactKeys(profile.env, [ENV_KEY]) || profile.env[ENV_KEY] !== expected.expectedApiOrigin) fail('PROFILE_ORIGIN');
  try { validateMobileBuildPreparation(app, eas, value.readiness); } catch { fail('BUILD_CONTRACT'); }
  return Object.freeze({ status: 'FOUNDER_ANDROID_INPUTS_VALIDATED_LOCAL_ONLY', sourceHead: value.head, profile: 'founder-device',
    projectId: PROJECT, package: app.android.package, semanticVersion: app.version, versionCode: app.android.versionCode, apiOrigin: ORIGIN,
    executionAuthorized: false, backendCompatibilityVerified: false, remoteEasConfigurationVerified: false, budgetVerified: false, buildInvoked: false });
}

/** Read-only local runner. The CLI has no injectable root, reader or commands. */
export function checkFounderAndroidBuildInputs(rawExpected, { repositoryRoot = ROOT } = {}) {
  const expected = expectations(rawExpected), root = path.resolve(repositoryRoot);
  const git = (...args) => {
    try { return execFileSync('git', ['--no-optional-locks','-c','core.fsmonitor=false','-C',root,...args], { windowsHide: true, stdio: ['ignore','pipe','pipe'], timeout: 30000, maxBuffer: 1048576 }).toString('utf8'); }
    catch { fail('GIT_READ_FAILED'); }
  };
  const inspectGit = () => {
    const head = git('rev-parse','--verify','HEAD').trim();
    if (head !== expected.expectedHead) fail('HEAD_CHANGED');
    const gitStatus = git('status','--porcelain=v1','-z','--untracked-files=all','--ignore-submodules=none');
    if (gitStatus !== '') fail('DIRTY_GIT'); return { head, gitStatus };
  };
  const before = inspectGit();
  try {
    for (let parent = root;; parent = path.dirname(parent)) {
      if (lstatSync(parent).isSymbolicLink()) fail('SOURCE_PATH');
      if (path.dirname(parent) === parent) break;
    }
    for (const name of ['app.config.js','app.config.ts','app.config.mjs','app.config.cjs']) {
      try { lstatSync(path.join(root, 'apps/mobile', name)); } catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
      fail('DYNAMIC_APP_CONFIG');
    }
    const read = relative => {
      const file = assertReleaseRegularFile(root, relative);
      if (lstatSync(file).size > 1048576) fail('SOURCE_SIZE');
      const bytes = readFileSync(file); if (bytes.length > 1048576) fail('SOURCE_SIZE'); return bytes;
    };
    const files = SOURCE_FILES.map(relative => ({ path: relative, bytes: read(relative) }));
    const data = Object.fromEntries(Object.entries(INPUTS).map(([name, relative]) => {
      const bytes = files.find(file => file.path === relative).bytes, text = bytes.toString('utf8');
      if (!Buffer.from(text).equals(bytes)) fail('SOURCE_ENCODING'); return [name, JSON.parse(text)];
    }));
    const result = validateFounderAndroidBuildInputs({ ...expected, ...before, ...data });
    const tree = git('rev-parse',`${expected.expectedHead}^{tree}`).trim();
    assertReleaseSourceBinding({ repositoryRoot: root, manifest: { source: { head: expected.expectedHead, tree },
      // Existing whole-checkout binding handles Git's PS1 CRLF classification;
      // its narrower manifest-input helper intentionally does not accept PS1.
      inputs: files.filter(file => !file.path.endsWith('.ps1')).map(file => ({ path: file.path, sha256: sha(file.bytes), byteSize: file.bytes.length })) } });
    for (const file of files) if (!read(file.path).equals(file.bytes)) fail('SOURCE_CHANGED');
    inspectGit();
    return Object.freeze({ ...result, trackedSourceBindingVerified: true });
  } catch (error) {
    if (error instanceof Error && /^FOUNDER_ANDROID_[A-Z_]+$/.test(error.message)) throw error;
    fail('LOCAL_INPUTS_REFUSED');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 6 || args[0] !== '--expected-head' || args[2] !== '--expected-api-origin' || args[4] !== '--expected-version-code'
      || !/^[1-9][0-9]{0,9}$/.test(args[5])) fail('CLI_INPUTS');
    console.log(JSON.stringify(checkFounderAndroidBuildInputs({ expectedHead: args[1], expectedApiOrigin: args[3], expectedVersionCode: Number(args[5]) })));
  } catch (error) {
    console.error(error instanceof Error && /^FOUNDER_ANDROID_[A-Z_]+$/.test(error.message) ? error.message : 'FOUNDER_ANDROID_INPUTS_REFUSED');
    process.exitCode = 1;
  }
}
