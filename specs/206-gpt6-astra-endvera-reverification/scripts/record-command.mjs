import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const spec = 'specs/206-gpt6-astra-endvera-reverification';
const descriptorPath = process.argv[2];
if (!descriptorPath) throw new Error('COMMAND_DESCRIPTOR_REQUIRED');
const d = JSON.parse(readFileSync(resolve(root, descriptorPath), 'utf8'));
if (!/^[A-Za-z0-9_-]+$/.test(d.id)) throw new Error('INVALID_COMMAND_ID');
const identity = JSON.parse(readFileSync(resolve(root, spec, 'CAMPAIGN_IDENTITY.json'), 'utf8'));
const cwd = resolve(root, d.cwd ?? '.');
if (relative(root, cwd).startsWith('..')) throw new Error('CWD_OUTSIDE_CAMPAIGN');
const runDir = resolve(root, spec, 'evidence', 'commands', d.id);
if (existsSync(runDir)) throw new Error('COMMAND_ID_ALREADY_RECORDED');
mkdirSync(runDir, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const hash = x => createHash('sha256').update(x).digest('hex');
const env = {};
for (const key of ['PATH','SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMFILES','PROGRAMFILES(X86)','NUMBER_OF_PROCESSORS']) {
  const actual = Object.keys(process.env).find(k => k.toLowerCase() === key.toLowerCase());
  if (actual) env[actual] = process.env[actual];
}
Object.assign(env, { CI: '1', NEXT_TELEMETRY_DISABLED: '1', EXPO_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', npm_config_offline: 'true', FORCE_COLOR: '0' });
for (const [key,value] of Object.entries(d.environment ?? {})) {
  if (/KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|DIRECT_URL|DATABASE_URL/i.test(key)) throw new Error('SECRET_ENV_DESCRIPTOR_FORBIDDEN');
  env[key] = String(value);
}
const startedAt = new Date().toISOString();
const observedHead = git('rev-parse','HEAD');
const observedTree = git('rev-parse','HEAD^{tree}');
const child = spawn(d.executable, d.args ?? [], { cwd, env, windowsHide: true, shell: false, stdio: ['pipe','pipe','pipe'] });
const stdout = [], stderr = [];
child.stdout.on('data', x => stdout.push(x));
child.stderr.on('data', x => stderr.push(x));
let launchError = null;
child.on('error', error => { launchError = error.code ?? 'SPAWN_ERROR'; });
if (d.stdinPath) child.stdin.end(readFileSync(resolve(root, d.stdinPath))); else child.stdin.end();
child.stdin.on('error', () => {});
let timedOut = false;
let cleanupStatus = null;
const timer = setTimeout(() => {
  timedOut = true;
  // Only the still-owned child PID and its descendants. Never match a process name.
  if (Number.isInteger(child.pid) && child.exitCode === null) {
    try {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide:true, stdio:'pipe', timeout:15000 });
      cleanupStatus = 'OWNED_PROCESS_TREE_STOPPED';
    } catch { cleanupStatus = 'OWNED_PROCESS_TREE_STOP_UNCONFIRMED'; }
  }
}, d.timeoutMs ?? 300000);
const exitCode = await new Promise(done => child.on('close', code => done(code ?? (timedOut ? 124 : 125))));
clearTimeout(timer);
const out = Buffer.concat(stdout), err = Buffer.concat(stderr);
if (launchError || timedOut) writeFileSync(resolve(runDir,'runner-diagnostic.json'), JSON.stringify({ launchError,timedOut,cleanupStatus,rawStreamsUnmodified:true },null,2)+'\n');
// Fail closed before writing any accidentally exposed secret; do not claim altered bytes are raw.
const secretPatterns = [
 /sk-or-v1-[A-Za-z0-9_-]{20,}/u,
 /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/u,
 /gh[pousr]_[A-Za-z0-9]{20,}/u,
 /AKIA[0-9A-Z]{16}/u,
 /AIza[0-9A-Za-z_-]{20,}/u,
 /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u,
 /(?:OPENAI_API_KEY|OPENROUTER_API_KEY|TWILIO_AUTH_TOKEN)\s*["']?\s*[:=]\s*["']?(?!REDACTED|\[REDACTED\]|<REDACTED>)[^\s"',}]{16,}/iu,
 /(?:api[_-]?key|auth[_-]?token|access[_-]?token|client[_-]?secret|password|secret)\s*["']?\s*[:=]\s*["']?(?!REDACTED|\[REDACTED\]|<REDACTED>|null\b|false\b)[A-Za-z0-9_./+=:@-]{16,}/iu,
 /Bearer\s+[A-Za-z0-9_./+=-]{20,}/iu,
 /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s/]+@/iu,
 /\bAC[0-9a-f]{32}\b/iu,
 /\bSK[0-9a-f]{32}\b/iu,
 /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
];
if (secretPatterns.some(pattern => pattern.test(out.toString('utf8')) || pattern.test(err.toString('utf8')))) {
  writeFileSync(resolve(runDir,'INCIDENT.json'), JSON.stringify({kind:'REDACTION_INCIDENT',campaignId:identity.campaignId,id:d.id,rawStreamsPersisted:false}));
  throw new Error('SECRET_OUTPUT_REFUSED_NO_RAW_STREAMS_PERSISTED');
}
const paths = Object.fromEntries(['stdout','stderr','command'].map(k => [k,`${spec}/evidence/commands/${d.id}/${k}.${k==='command'?'json':'txt'}`]));
writeFileSync(resolve(root,paths.stdout),out);
writeFileSync(resolve(root,paths.stderr),err);
const command = {
  id:d.id,campaignId:identity.campaignId,phase:d.phase,observedHead,observedTree,
  classification:d.classification,providerAttemptRequestId:null,
  command:d.command ?? [d.executable,...(d.args ?? [])].join(' '),workingDirectory:relative(root,cwd).replaceAll('\\','/') || '.',
  startedAt,finishedAt:new Date().toISOString(),expectedExitCode:0,exitCode,
  stdoutPath:paths.stdout,stdoutSha256:hash(out),stderrPath:paths.stderr,stderrSha256:hash(err),replay:d.replay ?? null
};
writeFileSync(resolve(root,paths.command),JSON.stringify(command,null,2)+'\n');
console.log(JSON.stringify({id:d.id,exitCode,durationMs:Date.parse(command.finishedAt)-Date.parse(startedAt),stdoutBytes:out.length,stderrBytes:err.length,record:paths.command}));
process.exitCode = exitCode;
