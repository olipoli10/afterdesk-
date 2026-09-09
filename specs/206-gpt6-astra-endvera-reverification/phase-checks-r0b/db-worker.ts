import { PrismaClient } from '@prisma-client';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { splitSqlStatements } from '../../../test/integration/global-setup';
import { assertSafeIntegrationDb } from '../../../test/integration/guard';
import { safeOutput } from './output-safe.mjs';

async function main() {
  const operation = process.argv[2];
  const url = process.env.AFTERDESK_TEST_DATABASE_URL;
  const guarded = assertSafeIntegrationDb(process.env);
  if (!url || !/^endvera206_[a-f0-9]+_integration$/.test(guarded.database)) throw new Error('CAMPAIGN_DB_IDENTITY_REFUSED');
  let connectionUrl = url;
  if (operation === 'create') {
    const rawAdmin = process.env.CAMPAIGN_DATABASE_ADMIN_URL;
    if (!rawAdmin) throw new Error('OWNED_SERVER_ADMIN_CONNECTION_MISSING');
    const admin = new URL(rawAdmin); const target = new URL(url);
    if (admin.hostname !== target.hostname || admin.port !== target.port || !['/template1','/postgres'].includes(admin.pathname)) throw new Error('OWNED_SERVER_ADMIN_IDENTITY_REFUSED');
    admin.searchParams.set('pgbouncer', 'true');
    connectionUrl = admin.href;
  }
  const client = new PrismaClient({ datasourceUrl: connectionUrl });
  try {
    const dirs = readdirSync('prisma/migrations').filter(x => /^\d{14}_/.test(x)).sort();
    const chain = dirs.map(name => ({name, sql: readFileSync(join('prisma/migrations', name, 'migration.sql'), 'utf8')}));
    const digest = createHash('sha256').update(JSON.stringify(chain)).digest('hex');
    if (operation === 'create') {
      // Each worker is connected to an exclusively owned server, never an application store.
      await client.$executeRawUnsafe(`CREATE DATABASE "${guarded.database}" TEMPLATE template0`);
    } else if (operation === 'clean' || operation === 'upgrade' || operation === 'seed' || operation === 'restart-write') {
      const existing = await client.$queryRawUnsafe<{n: bigint}[]>("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'");
      if (Number(existing[0].n) !== 0) throw new Error('CAMPAIGN_DATABASE_NOT_EMPTY');
      const cut = operation === 'upgrade' ? chain.length - 1 : chain.length;
      for (const migration of chain.slice(0, cut)) {
        for (const sql of splitSqlStatements(migration.sql)) await client.$executeRawUnsafe(sql);
      }
      await client.$executeRawUnsafe('CREATE TABLE campaign206_marker (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
      await client.$executeRawUnsafe("INSERT INTO campaign206_marker VALUES ('synthetic-persistence', 'synthetic-only-no-provider')");
      if (operation === 'upgrade') {
        const snapshot = chain[cut - 1].name;
        // A deterministic previous-chain snapshot, not a claim of restored production backup.
        for (const migration of chain.slice(cut)) for (const sql of splitSqlStatements(migration.sql)) await client.$executeRawUnsafe(sql);
        console.log(`DATABASE_UPGRADE previousSnapshot=${snapshot} applied=${chain.length-cut} chain=${digest}`);
      }
      if (operation === 'seed' || operation === 'restart-write') {
        await client.user.create({ data: { id: 'campaign206-synthetic-user', name: 'Synthetic Campaign User', email: 'campaign206@example.invalid', role: 'CLIENT' } });
        const stored = await client.user.findUniqueOrThrow({ where: { id: 'campaign206-synthetic-user' } });
        if (stored.email !== 'campaign206@example.invalid') throw new Error('SYNTHETIC_SEED_READBACK_MISMATCH');
      }
      const markers = await client.$queryRawUnsafe<{value:string}[]>("SELECT value FROM campaign206_marker WHERE id='synthetic-persistence'");
      if (markers[0]?.value !== 'synthetic-only-no-provider') throw new Error('DATABASE_MARKER_LOST');
      const tables = await client.$queryRawUnsafe<{n:bigint}[]>("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'");
      if (Number(tables[0].n) < 100) throw new Error('DATABASE_SCHEMA_INCOMPLETE');
      console.log(`DATABASE_OPERATION_VERIFIED operation=${operation} migrations=${chain.length} tables=${tables[0].n} chain=${digest}`);
    } else if (operation === 'restart-read') {
      const markers = await client.$queryRawUnsafe<{value:string}[]>("SELECT value FROM campaign206_marker WHERE id='synthetic-persistence'");
      const user = await client.user.findUniqueOrThrow({ where: { id: 'campaign206-synthetic-user' } });
      if (markers[0]?.value !== 'synthetic-only-no-provider' || user.email !== 'campaign206@example.invalid') throw new Error('DATABASE_RESTART_READBACK_MISMATCH');
      console.log('DATABASE_RESTART_READBACK_VERIFIED marker=1 syntheticUsers=1');
    } else throw new Error('DATABASE_OPERATION_UNKNOWN');
  } finally { await client.$disconnect(); }
}
main().catch(error => {
  // Never serialize Prisma error messages: they may contain a connection URI.
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'LOCAL_OPERATION_FAILED';
  console.error(`DATABASE_WORKER_FAILURE code=${/^[A-Z0-9_]+$/.test(code) ? code : 'UNCLASSIFIED'}`);
  if(error&&typeof error==='object'&&'meta' in error&&error.meta&&typeof error.meta==='object') {
    const meta=error.meta as Record<string,unknown>;
    for(const key of ['code','message'])if(typeof meta[key]==='string')console.error(`DATABASE_SQL_${key.toUpperCase()}=${safeOutput(meta[key]).slice(0,700)}`);
  }
  process.exitCode = 1;
});
