import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SpendLedger } from "./provider-budget";

/**
 * THE SHARED COUNTER, ON DISK, BECAUSE THE WORKERS DO NOT SHARE MEMORY.
 *
 * Vitest runs test files in separate processes. A budget object therefore
 * counts one worker's spend and nothing else, which turns a "$1.50 cap" into
 * "$1.50 per worker" the moment anything runs in parallel. This file is the
 * one number all of them agree on.
 *
 * ── THE LOCK IS A FILE THAT CANNOT BE CREATED TWICE ──
 *
 * `openSync(path, "wx")` fails if the path exists, atomically, on every
 * platform this runs on. That is the whole mutual exclusion: whoever creates
 * the lock file owns the counter until it is removed. A held lock is retried
 * with a spin and then GIVES UP rather than stealing it — a stale lock means
 * we do not know what another process reserved, and the safe answer to "how
 * much has been spent" being unknown is to refuse the call.
 *
 * ── WHY RESERVE-THEN-SETTLE HERE TOO ──
 *
 * A process that crashes between dispatch and settle leaves its reservation
 * standing, so the global total stays pessimistic instead of forgetting money
 * that may well have been spent. The reservation is the safe direction; a
 * counter that only recorded completed calls would let a crash loop spend
 * without limit.
 */

export type LedgerState = { calls: number; micros: number; updatedAt: string };

const LOCK_SPINS = 200;
const LOCK_SPIN_MS = 5;

export class FileSpendLedger implements SpendLedger {
  readonly path: string;
  private readonly lockPath: string;

  constructor(path: string) {
    this.path = path;
    this.lockPath = `${path}.lock`;
    mkdirSync(join(path, ".."), { recursive: true });
  }

  read(): LedgerState {
    if (!existsSync(this.path)) return { calls: 0, micros: 0, updatedAt: "never" };
    const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<LedgerState>;
    return {
      calls: Number(parsed.calls ?? 0),
      micros: Number(parsed.micros ?? 0),
      updatedAt: String(parsed.updatedAt ?? "unknown"),
    };
  }

  /** Start a fresh live session. Deliberately explicit — never automatic. */
  reset(): void {
    rmSync(this.path, { force: true });
    rmSync(this.lockPath, { force: true });
  }

  reserve(calls: number, micros: number): { calls: number; micros: number } {
    return this.withLock(() => {
      const state = this.read();
      const next: LedgerState = {
        calls: state.calls + calls,
        micros: state.micros + micros,
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(this.path, JSON.stringify(next, null, 1));
      return { calls: next.calls, micros: next.micros };
    });
  }

  settle(reservedMicros: number, actualMicros: number): void {
    this.withLock(() => {
      const state = this.read();
      // Never below zero: an unmatched settle must not create headroom.
      const micros = Math.max(0, state.micros - reservedMicros + actualMicros);
      writeFileSync(
        this.path,
        JSON.stringify({ ...state, micros, updatedAt: new Date().toISOString() }, null, 1)
      );
      return null;
    });
  }

  private withLock<T>(fn: () => T): T {
    let fd: number | null = null;
    for (let i = 0; i < LOCK_SPINS; i++) {
      try {
        fd = openSync(this.lockPath, "wx");
        break;
      } catch {
        spinFor(LOCK_SPIN_MS);
      }
    }
    if (fd === null) {
      throw new Error(
        `the shared spend ledger lock at ${this.lockPath} is still held after ` +
          `${(LOCK_SPINS * LOCK_SPIN_MS) / 1000}s. Another test process may be mid-call, or a ` +
          `previous run died holding it — delete the file to clear it.`
      );
    }
    try {
      return fn();
    } finally {
      closeSync(fd);
      rmSync(this.lockPath, { force: true });
    }
  }
}

/**
 * A busy wait, on purpose: `reserve` is called from a synchronous method that
 * gates a paid call, and making it async would mean every caller could
 * interleave a second dispatch inside the await. The spin is milliseconds and
 * only ever runs in live mode, which is the one mode already dominated by
 * network latency.
 */
function spinFor(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* deliberate */
  }
}

export const DEFAULT_LEDGER_PATH = join(process.cwd(), ".provider-spend-ledger.json");
