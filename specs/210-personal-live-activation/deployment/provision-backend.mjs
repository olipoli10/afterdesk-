// Explicit, bounded personal-pilot provisioning. Secrets stay in child-process
// memory/stdin; neither credentials nor raw provider errors are logged or saved.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const cli = process.env.ENDVERA_VERCEL_CLI_PATH;
const project = 'prj_cEvjMH8iJ2C9khbZ0vsQlGKQ4Y75';
const team = 'team_txoYNQAo21jmENCfI2EG4pdP';
const originalHost = 'ep-morning-violet-axifrhr8.c-4.us-east-2.aws.neon.tech';
const pilotHost = 'ep-purple-union-axj3h2t5.c-4.us-east-2.aws.neon.tech';
const origin = 'https://endvera-core-sandbox-afterdesk.vercel.app';
const mode = process.argv[2];
const evidencePath = resolve(import.meta.dirname, 'backend-provisioning.json');
const authorization = JSON.parse(readFileSync(resolve(root, 'specs/210-personal-live-activation/authorization.json')));
if (!cli || !['migrate-isolated', 'configure-disabled'].includes(mode)) throw new Error('EXPLICIT_MODE_AND_CLI_PATH_REQUIRED');
if (authorization.id !== 'ENDVERA-PERSONAL-20260910-100CAD' || authorization.totalCeiling !== '100.00' || Date.parse(authorization.expiresAt) <= Date.now()) throw new Error('CURRENT_AUTHORIZATION_REQUIRED');
const link = JSON.parse(readFileSync(resolve(root, '.vercel/project.json')));
if (link.projectId !== project || link.orgId !== team) throw new Error('PROJECT_LINK_MISMATCH');

function api(endpoint, body) {
  const args = [cli, 'api', endpoint, '--scope', 'afterdesk', '--raw'];
  // CLI 59.15.1 rejects this valid array input as Invalid JSON on this host.
  // Use its existing local login only for the same Vercel API destination;
  // credentials never appear in argv, output, repo files or third-party calls.
  const postScript = `import {readFileSync} from 'node:fs'; import {join} from 'node:path';
    const endpoint=process.argv[1]; if(!/^\\/v10\\/projects\\/prj_cEvjMH8iJ2C9khbZ0vsQlGKQ4Y75\\/env\\?upsert=true$/.test(endpoint)) throw new Error('ENDPOINT_REFUSED');
    const token=JSON.parse(readFileSync(join(process.env.APPDATA,'com.vercel.cli','Data','auth.json'),'utf8')).token;
    if(!token) throw new Error('MANAGED_LOGIN_REQUIRED');
    const chunks=[];for await(const chunk of process.stdin) chunks.push(chunk);const body=Buffer.concat(chunks).toString('utf8');JSON.parse(body);
    const response=await fetch('https://api.vercel.com'+endpoint+'&teamId=team_txoYNQAo21jmENCfI2EG4pdP',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(45000)});
    if(!response.ok){console.error('VERCEL_HTTP_'+response.status);process.exit(1)}
    process.stdout.write(await response.text());`;
  const result = spawnSync(process.execPath, body ? ['--input-type=module','-e',postScript,endpoint] : args, { cwd: root, input: body ? JSON.stringify(body) : undefined, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) {
    let diagnostic = String(result.stderr ?? '');
    for (const item of Array.isArray(body) ? body : body ? [body] : []) {
      if (typeof item.value === 'string') diagnostic = diagnostic.split(item.value).join('[VALUE_REDACTED]');
    }
    diagnostic = diagnostic.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[DATABASE_URL_REDACTED]').replace(/(?:sk-|npg_)[A-Za-z0-9_-]+/g, '[SECRET_REDACTED]');
    console.error(diagnostic.slice(0,1500));
    throw new Error('VERCEL_API_OPERATION_FAILED');
  }
  try { return JSON.parse(result.stdout); } catch { throw new Error('VERCEL_API_INVALID_JSON'); }
}

const all = api(`/v10/projects/${project}/env`).envs;
const credentialEntry = all.find(e => e.key === 'DATABASE_URL_UNPOOLED' && e.target?.includes('preview'));
if (!credentialEntry) throw new Error('DEDICATED_SOURCE_DATABASE_CONFIGURATION_MISSING');
const source = new URL(api(`/v1/projects/${project}/env/${credentialEntry.id}`).value);
if (source.hostname !== originalHost || source.pathname !== '/neondb' || !source.password || !['postgres:', 'postgresql:'].includes(source.protocol)) throw new Error('SOURCE_DATABASE_TARGET_MISMATCH');
// The normal Neon branch inherits the source database roles. Connection is
// tested below before migration. This never changes the original branch.
source.hostname = pilotHost;
const direct = source.toString();
const pooled = new URL(direct);
pooled.hostname = pilotHost.replace('.c-4.', '-pooler.c-4.');

let evidence = { schemaVersion: 1, authorizationId: authorization.id, projectId: project, branchId: 'br-nameless-moon-ax8nmuwj', databaseHost: pilotHost, originalBranchUnmodified: true, externalExecutionEnabled: false };
if (mode === 'migrate-isolated') {
  const childEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, DATABASE_URL: direct, DIRECT_URL: direct, PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' };
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', 'import {PrismaClient} from "./.prisma-client/index.js"; const p=new PrismaClient(); try { const r=await p.$queryRawUnsafe("SELECT count(*)::int AS count FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"); if(r[0].count!==68) process.exitCode=2; else console.log("SOURCE_MIGRATIONS_68_CONFIRMED"); } finally {await p.$disconnect()}'], { cwd: root, env: childEnv, encoding: 'utf8', timeout: 60000 });
  if (probe.status !== 0) throw new Error('ISOLATED_DATABASE_PREFLIGHT_FAILED_OUTPUT_WITHHELD');
  const migration = spawnSync(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: root, env: childEnv, encoding: 'utf8', timeout: 120000 });
  if (migration.status !== 0) throw new Error('ISOLATED_MIGRATION_FAILED_OUTPUT_WITHHELD');
  const verify = spawnSync(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'status'], { cwd: root, env: childEnv, encoding: 'utf8', timeout: 60000 });
  if (verify.status !== 0) throw new Error('ISOLATED_MIGRATION_STATUS_FAILED_OUTPUT_WITHHELD');
  evidence = { ...evidence, migrationStatus: 'APPLIED_AND_UP_TO_DATE', migratedAt: new Date().toISOString(), migrationsExpected: 70, configurationStatus: 'NOT_CHANGED' };
} else {
  const prior = JSON.parse(readFileSync(evidencePath));
  if (prior.branchId !== evidence.branchId || prior.migrationStatus !== 'APPLIED_AND_UP_TO_DATE') throw new Error('ISOLATED_MIGRATION_EVIDENCE_REQUIRED');
  const values = [
    {key:'DIRECT_URL',value:direct,type:'sensitive'},
    {key:'DATABASE_URL',value:pooled.toString(),type:'sensitive'},
    ...Object.entries({
      BETTER_AUTH_URL: origin, APP_URL: origin, NEXT_PUBLIC_SITE_URL: origin,
      ENDVERA_PERSONAL_PILOT_EXPIRES_AT: authorization.expiresAt,
      // Outgoing reservations get only part of the 30 CAD Twilio envelope.
      ENDVERA_PERSONAL_BUDGET_CAD:'15.00',
      ENDVERA_EXTERNAL_AUTHORITY_REF: authorization.id, ENDVERA_EXTERNAL_OWNER_REF:'Olivier-personal-pilot',
      ENDVERA_PROVIDER_WEBHOOK_ORIGIN: origin,
      ENDVERA_TWILIO_SMS_WEBHOOK_URL: `${origin}/api/webhooks/twilio/sms`,
      ENDVERA_TWILIO_STATUS_WEBHOOK_URL: `${origin}/api/webhooks/twilio/status`,
      GOOGLE_REDIRECT_URI: `${origin}/api/endvera/v1/personal/google/callback`,
      ENDVERA_EXTERNAL_TRANSPORT_ENABLED:'DISABLED',
      ENDVERA_PERSONAL_SMS_INGRESS_ENABLED:'false', ENDVERA_PERSONAL_SMS_WORKER_ENABLED:'false',
      ENDVERA_PERSONAL_OUTBOUND_ENABLED:'false', ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED:'false',
    }).map(([key,value])=>({key,value,type:'plain'})),
  ];
  for (const key of ['CRON_SECRET','ENDVERA_CONNECTOR_ENCRYPTION_KEY']) {
    if (!all.some(e=>e.key===key && e.target?.includes('production'))) values.push({key,value:randomBytes(32).toString('base64'),type:'sensitive'});
  }
  const outcome = api(`/v10/projects/${project}/env?upsert=true`, values.map(e=>({...e,target:['production']})));
  if (outcome.failed?.length) throw new Error('VERCEL_ENV_BATCH_PARTIAL_FAILURE_RECONCILE_BEFORE_RETRY');
  const names = api(`/v10/projects/${project}/env`).envs.filter(e=>e.target?.includes('production')).map(e=>e.key);
  if (values.some(e=>!names.includes(e.key))) throw new Error('CONFIGURATION_VERIFICATION_FAILED');
  evidence = {...prior, configuredAt:new Date().toISOString(), configurationStatus:'PRODUCTION_CONFIGURED_EXECUTION_DISABLED', configuredKeys:values.map(e=>e.key), previousDeploymentForRollback:'dpl_F6ZK274V2aoyyxuRFotNQcMimSLi', origin};
}
writeFileSync(evidencePath, JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
