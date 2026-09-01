import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The L3/canary harness's reserved test database, read-only, straight from
 * `.env.l3.local` — never from `process.env`, since neither the integration
 * global-setup nor per-file-setup ever carry it. Absent file (no L3 work
 * ever done in this checkout) is the normal case, not an error: guard
 * condition 6 treats a missing value as a no-op.
 *
 * Shared by BOTH `global-setup.ts` (once per suite) and `per-file-setup.ts`
 * (once per worker process) — each is an independent
 * `assertSafeIntegrationDb` call site, and condition 6 only protects the
 * one it's actually passed into.
 */
export function resolveL3TestDatabaseUrl(): string | null {
  try {
    const envFile = readFileSync(join(__dirname, "..", "..", ".env.l3.local"), "utf8");
    const m = /^AFTERDESK_TEST_DATABASE_URL="?([^"\n]+)"?/m.exec(envFile);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}
