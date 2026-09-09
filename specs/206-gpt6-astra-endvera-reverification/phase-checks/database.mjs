import { existsSync, readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';

// Exact pre-existing runtime. No npm, latest resolver, download, or borrowed DB.
export const runtimePath = 'C:/Users/oliro/AppData/Local/Temp/@prisma/cli-dev@latest-1788753600000/node_modules/@prisma/dev/dist/index.js';
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer(); server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
export async function withDatabase(task) {
  if (!existsSync(runtimePath)) throw new Error('INSTALLED_PRISMA_DEV_RUNTIME_MISSING');
  const provenance = JSON.parse(readFileSync(new URL('./runtime-provenance.json', import.meta.url), 'utf8'));
  if (provenance.entrypoint !== runtimePath || createHash('sha256').update(readFileSync(runtimePath)).digest('hex') !== provenance.sha256) throw new Error('INSTALLED_PRISMA_DEV_RUNTIME_DRIFT');
  const { startPrismaDevServer } = await import(pathToFileURL(runtimePath).href);
  const suffix = randomUUID().replaceAll('-', '');
  const name = `endvera206-${suffix}`;
  const options = {name, persistenceMode: 'stateful', port: await freePort(), databasePort: await freePort(), shadowDatabasePort: await freePort(), streamsPort: await freePort()};
  let server;
  let created = false;
  const connect = async () => {
    server = await startPrismaDevServer(options); created = true;
    const url = new URL(server.database.connectionString);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('NON_LOCAL_DATABASE_REFUSED');
    const adminUrl = url.href;
    url.pathname = `/endvera206_${suffix}_integration`;
    url.searchParams.set('pgbouncer', 'true'); url.searchParams.set('connection_limit', '10');
    return { AFTERDESK_TEST_DATABASE_URL: url.href, CAMPAIGN_DATABASE_ADMIN_URL: adminUrl, ALLOW_INTEGRATION_DB_RESET: '1' };
  };
  try {
    const env = await connect();
    console.log(`DATABASE_OWNERSHIP engine=PrismaDev-PGlite name=${name} databasePort=${options.databasePort} uniqueStore=true`);
    await task(env, async () => {
      await server.close(); server = undefined;
      console.log('DATABASE_SERVER_CLOSED_BEFORE_RESTART');
      const next = await connect();
      if (next.AFTERDESK_TEST_DATABASE_URL !== env.AFTERDESK_TEST_DATABASE_URL) throw new Error('DATABASE_RESTART_IDENTITY_CHANGED');
      console.log('DATABASE_SERVER_RESTARTED');
    });
  } finally {
    if (server) await server.close();
    if (created) console.log(`DATABASE_SERVER_CLOSED name=${name} retainedSyntheticStore=true`);
  }
}
