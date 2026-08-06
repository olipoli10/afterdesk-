import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertSafeIntegrationDb } from "./guard";

/**
 * Runs ONCE before the suite: guard, announce, rebuild, migrate.
 *
 * WHY NOT `prisma migrate deploy`: the local `prisma dev` proxy multiplexes
 * every SECONDARY database through pooled backend sessions, and the schema
 * engine — unlike the client — ignores `pgbouncer=true`, so its named
 * prepared statements collide ("prepared statement s0 already exists").
 * The CLIENT connection works fine through the proxy, so the setup applies
 * every migration.sql itself, statement by statement, through a
 * dollar-quoting-aware splitter (the trigger functions carry semicolons
 * inside $$ bodies — a naive split would shred them).
 *
 * The schema is DROPPED and rebuilt from the full migration chain on every
 * run: fully deterministic, no drift, no bookkeeping — and safe only
 * because the six-condition guard proved this database is disposable.
 * An unreachable database is a LOUD failure, never a skip.
 */

/** Split SQL on top-level semicolons, honoring $tag$…$tag$, quotes, comments. */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  let dollarTag: string | null = null;
  let inSingle = false;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < sql.length) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);
    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (two === "*/") {
        current += "/";
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++;
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += ch;
      i++;
      continue;
    }
    if (inSingle) {
      current += ch;
      if (ch === "'" && sql[i + 1] === "'") {
        current += "'";
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }
    if (two === "--") {
      inLineComment = true;
      current += ch;
      i++;
      continue;
    }
    if (two === "/*") {
      inBlockComment = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === "$") {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (m) {
        dollarTag = m[0];
        current += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 0) out.push(trimmed);
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  const tail = current.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

/** The app's own DATABASE_URL — from env, else parsed read-only from .env. */
function resolveAppDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envFile = readFileSync(join(__dirname, "..", "..", ".env"), "utf8");
    const m = /^DATABASE_URL="?([^"\n]+)"?/m.exec(envFile);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function identityDiffers(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return (
      ua.hostname !== ub.hostname ||
      (ua.port || "5432") !== (ub.port || "5432") ||
      ua.pathname !== ub.pathname
    );
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  const db = assertSafeIntegrationDb(process.env);

  console.log(
    `\n[integration] target database: host=${db.host} db=${db.database}\n` +
      `[integration] its schema is rebuilt from the migration chain when it drifts; data is truncated between files.\n`
  );

  const url = db.url.includes("pgbouncer=") ? db.url : `${db.url}&pgbouncer=true`;
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    /**
     * CONDITION 7 — PHYSICAL ISOLATION PROBE. Learned the hard way: the
     * local `prisma dev` proxy ALIASES every database name onto the same
     * underlying PGlite store, so "afterdesk_integration" on the same port
     * as the app IS the app database wearing a different name — and the
     * six name-based conditions cannot see that. A table is created in the
     * test database and must be INVISIBLE through the app's own connection;
     * if it shows up, the suite refuses to run before any destructive
     * statement. On this machine that means the integration cluster must be
     * a SEPARATE `npx prisma dev --name integration` instance (own port,
     * own store), never a CREATE DATABASE on the app's port.
     */
    const appUrl = resolveAppDatabaseUrl();
    if (appUrl && identityDiffers(appUrl, url)) {
      const probe = `it_isolation_probe_${Date.now().toString(36)}`;
      await client.$executeRawUnsafe(`CREATE TABLE "${probe}" (x int)`);
      const appClient = new PrismaClient({
        datasourceUrl: appUrl.includes("pgbouncer=") ? appUrl : `${appUrl}&pgbouncer=true`,
      });
      try {
        const seen = await appClient.$queryRawUnsafe<{ v: boolean }[]>(
          `SELECT to_regclass('public.${probe}') IS NOT NULL AS v`
        );
        if (seen[0]?.v) {
          throw new Error(
            `INTEGRATION DB GUARD FAILED [ALIASED_DATABASE]: a table created in ` +
              `${db.database} is visible through the app's DATABASE_URL — the server ` +
              `aliases database names onto one store. Run the integration cluster as a ` +
              `separate instance: \`npx prisma dev --name integration\`, then point ` +
              `AFTERDESK_TEST_DATABASE_URL at ITS port.`
          );
        }
      } finally {
        await appClient.$disconnect();
        await client.$executeRawUnsafe(`DROP TABLE IF EXISTS "${probe}"`).catch(() => {});
      }
      console.log(`[integration] isolation probe passed: the app connection cannot see this store.`);
    } else if (!appUrl) {
      console.log(`[integration] no app DATABASE_URL found to probe against — proceeding.`);
    }

    const migrationsDir = join(__dirname, "..", "..", "prisma", "migrations");
    const dirs = readdirSync(migrationsDir)
      .filter((d) => /^\d{14}_/.test(d))
      .sort();
    const chain = dirs.join(",");

    // Rebuild ONLY when the migration chain changed: a full DROP SCHEMA
    // CASCADE on every run is what kept crashing the fragile local
    // prisma-dev proxy. The applied chain is recorded in a marker table;
    // the per-file TRUNCATEs keep the data clean between files either way.
    let needsRebuild = true;
    try {
      const marker = await client.$queryRawUnsafe<{ chain: string }[]>(
        `SELECT chain FROM it_schema_marker LIMIT 1`
      );
      if (marker[0]?.chain === chain) needsRebuild = false;
    } catch {
      // No marker table: first run against this database.
    }

    if (needsRebuild) {
      await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
      await client.$executeRawUnsafe(`CREATE SCHEMA public`);
      for (const dir of dirs) {
        const sql = readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8");
        for (const statement of splitSqlStatements(sql)) {
          try {
            await client.$executeRawUnsafe(statement);
          } catch (error) {
            throw new Error(
              `[integration] migration ${dir} failed on statement:\n${statement.slice(0, 300)}\n→ ${String(error).slice(0, 400)}`
            );
          }
        }
      }
      await client.$executeRawUnsafe(`CREATE TABLE it_schema_marker (chain TEXT NOT NULL)`);
      await client.$executeRawUnsafe(`INSERT INTO it_schema_marker (chain) VALUES ($1)`, chain);
      console.log(`[integration] ${dirs.length} migrations applied (full rebuild).`);
    } else {
      console.log(`[integration] schema up to date (${dirs.length} migrations); no rebuild.`);
    }
  } catch (error) {
    throw new Error(
      `[integration] schema rebuild failed against ${db.database}. If the local cluster is ` +
        `down: kill stray node processes, remove the stale .lock/server.json/postmaster.pid ` +
        `under AppData/Local/prisma-dev-nodejs/Data, then relaunch \`npx prisma dev\`. ` +
        `${String(error).slice(0, 700)}`
    );
  } finally {
    await client.$disconnect();
  }
}
