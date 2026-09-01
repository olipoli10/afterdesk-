/**
 * THE TEST-SPEND FIREWALL.
 *
 * A test suite burned twenty dollars of provider credit in one afternoon
 * because nothing in the harness could say "no". This module is the "no": it
 * decides whether a test may talk to a paid provider at all, caps how many
 * calls and how many dollars it may spend, announces the estimate BEFORE the
 * run rather than the bill after it, and throws the moment either cap would
 * be crossed.
 *
 * ── THE THREE MODES ──
 *
 * `replay`    the default, and the only mode that needs no permission. Every
 *             provider response comes from a recorded fixture; the cost is
 *             exactly zero and a missing fixture is a loud failure, never a
 *             silent live call.
 * `synthetic` no provider at all, not even a recording: the test injects the
 *             model output it wants to exercise. Also zero.
 * `live`      real calls, real money. Requires ALLOW_LIVE_PROVIDER_TESTS=true
 *             AND stays inside both caps. Every live call is recorded, so the
 *             money spent buys a fixture the next run reuses for free.
 *
 * ── FAIL-CLOSED, IN BOTH DIRECTIONS ──
 *
 * The mode defaults to `replay`: forgetting to set anything cannot spend.
 * The caps default LOW (5 calls, $1.00): remembering to allow live but
 * forgetting to set a budget cannot spend much. And a call is refused when
 * its CONSERVATIVE ESTIMATE would cross the cap, not when the actual already
 * has — the same reserve-then-settle discipline the production budget engine
 * uses, for the same reason: you cannot un-spend a call you already made.
 *
 * ── ONE PROCESS IS NOT THE CAP ──
 *
 * Three workers each holding a one-dollar budget spend three dollars under a
 * label that says one. So a budget can be given a SpendLedger — a counter
 * shared by every process — and the cap it enforces is then the global one. A
 * ledger it cannot read refuses the call rather than falling back to the
 * per-process number, because a cap that quietly loosens on an I/O error is
 * the failure this whole file exists to prevent.
 *
 * NO IMPORTS. The firewall must be testable without a database, a network or
 * the provider SDK, and nothing it depends on may be able to spend money. The
 * ledger is therefore an INTERFACE here and a file elsewhere.
 */

export type TestProviderMode = "replay" | "synthetic" | "live";

/**
 * THE CROSS-PROCESS HALF OF THE CAP.
 *
 * A `ProviderBudget` counts what ONE process spends. Three test workers each
 * holding a one-dollar budget is a three-dollar cap wearing a one-dollar
 * label, and the whole point of this module is that the number on the label is
 * the number that binds.
 *
 * So a budget may be handed a ledger: a small shared counter every live caller
 * reserves against before it dispatches. The interface is declared here and
 * IMPLEMENTED ELSEWHERE, which is what keeps this file import-free — the
 * implementation needs the filesystem, and the arithmetic that protects the
 * money must stay testable without one.
 */
export type SpendLedger = {
  /**
   * Atomically add a reservation and return the TOTALS across every process,
   * including this one. Throwing is a valid answer: the caller treats a ledger
   * that cannot be read as a refusal, never as a zero.
   */
  reserve(calls: number, micros: number): { calls: number; micros: number };
  /** Replace a reservation with what the call actually cost. */
  settle(reservedMicros: number, actualMicros: number): void;
};

export class ProviderBudgetExceeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderBudgetExceeded";
  }
}

export class LiveProviderForbidden extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveProviderForbidden";
  }
}

/** Defaults chosen so a mistake is cheap: five calls, one dollar. */
export const DEFAULT_MAX_CALLS = 5;
export const DEFAULT_MAX_SPEND_MICROS = 1_000_000;

/**
 * A conservative per-call reservation used before the real cost is known.
 * Sized above a classification+plan pair on the expensive model so the cap
 * cannot be crossed by a single unusually large call.
 */
export const DEFAULT_CALL_RESERVE_MICROS = 400_000;

export type BudgetEnv = {
  ALLOW_LIVE_PROVIDER_TESTS?: string;
  TEST_PROVIDER_MODE?: string;
  TEST_PROVIDER_MAX_CALLS?: string;
  TEST_PROVIDER_MAX_SPEND_MICROS?: string;
  /** Where the cross-process counter lives. One path per live session. */
  TEST_PROVIDER_LEDGER_PATH?: string;
};

/**
 * `live` is reachable ONLY through the explicit opt-in. Asking for it any
 * other way — TEST_PROVIDER_MODE=live alone, a typo, an inherited shell
 * variable — lands on replay, which costs nothing.
 */
export function resolveMode(env: BudgetEnv): TestProviderMode {
  const requested = (env.TEST_PROVIDER_MODE ?? "").trim().toLowerCase();
  if (requested === "synthetic") return "synthetic";
  if (requested === "live") {
    if (env.ALLOW_LIVE_PROVIDER_TESTS === "true") return "live";
    throw new LiveProviderForbidden(
      "TEST_PROVIDER_MODE=live requires ALLOW_LIVE_PROVIDER_TESTS=true. " +
        "Live tests spend real money; the opt-in is deliberate and must be typed out."
    );
  }
  return "replay";
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export type BudgetOptions = {
  label: string;
  maxCalls?: number;
  maxSpendMicros?: number;
  callReserveMicros?: number;
  /** Shared across processes. Absent means this process is the only spender. */
  ledger?: SpendLedger;
};

export class ProviderBudget {
  readonly label: string;
  readonly maxCalls: number;
  readonly maxSpendMicros: number;
  readonly callReserveMicros: number;
  private readonly ledger: SpendLedger | null;
  private calls = 0;
  private spentMicros = 0;

  constructor(opts: BudgetOptions, env: BudgetEnv = {}) {
    this.label = opts.label;
    this.maxCalls = opts.maxCalls ?? positiveInt(env.TEST_PROVIDER_MAX_CALLS, DEFAULT_MAX_CALLS);
    this.maxSpendMicros =
      opts.maxSpendMicros ??
      positiveInt(env.TEST_PROVIDER_MAX_SPEND_MICROS, DEFAULT_MAX_SPEND_MICROS);
    this.callReserveMicros = opts.callReserveMicros ?? DEFAULT_CALL_RESERVE_MICROS;
    this.ledger = opts.ledger ?? null;
  }

  /** The sentence a human reads BEFORE anything is spent. */
  announce(plannedCalls: number): string {
    const worst = Math.min(plannedCalls, this.maxCalls) * this.callReserveMicros;
    return (
      `[${this.label}] provider budget: $${usd(this.maxSpendMicros)} / ${this.maxCalls} calls. ` +
      `Planned: ${plannedCalls} calls, worst case ~$${usd(Math.min(worst, this.maxSpendMicros))}.`
    );
  }

  /**
   * Reserve room for one call. Throws rather than letting the caller find out
   * afterwards — the whole point is that no script can run past the cap.
   */
  reserve(estimateMicros: number = this.callReserveMicros): void {
    const reserved = Math.max(0, estimateMicros);
    if (this.calls >= this.maxCalls) {
      throw new ProviderBudgetExceeded(
        `[${this.label}] call cap reached: ${this.calls}/${this.maxCalls}. ${this.status()}`
      );
    }
    const projected = this.spentMicros + reserved;
    if (projected > this.maxSpendMicros) {
      throw new ProviderBudgetExceeded(
        `[${this.label}] spend cap would be crossed: $${usd(this.spentMicros)} spent + ` +
          `$${usd(estimateMicros)} reserved > $${usd(this.maxSpendMicros)} cap. ${this.status()}`
      );
    }

    /**
     * The SHARED check, after the local one and before the call is counted.
     *
     * A ledger that throws — unreadable, corrupt, on a filesystem that said no
     * — refuses the call. That is not paranoia about disks: the ledger is the
     * only thing that knows what the OTHER workers have already spent, and a
     * cap that silently becomes per-process when a read fails is the exact
     * defect this exists to close.
     */
    if (this.ledger) {
      let totals: { calls: number; micros: number };
      try {
        totals = this.ledger.reserve(1, reserved);
      } catch (error) {
        throw new ProviderBudgetExceeded(
          `[${this.label}] the shared spend ledger could not be read, so the global cap ` +
            `cannot be enforced and no call may be made: ${String(error).slice(0, 200)}`
        );
      }
      if (totals.calls > this.maxCalls || totals.micros > this.maxSpendMicros) {
        this.ledger.settle(reserved, 0);
        throw new ProviderBudgetExceeded(
          `[${this.label}] GLOBAL cap would be crossed across all test processes: ` +
            `${totals.calls} calls / $${usd(totals.micros)} reserved against ` +
            `${this.maxCalls} calls / $${usd(this.maxSpendMicros)}. ${this.status()}`
        );
      }
      this.lastReserved = reserved;
    }
    this.calls += 1;
  }

  private lastReserved = 0;

  /** Settle the reservation with what the call actually cost. */
  settle(actualMicros: number): void {
    const actual = Math.max(0, actualMicros);
    this.spentMicros += actual;
    if (this.ledger) {
      this.ledger.settle(this.lastReserved, actual);
      this.lastReserved = 0;
    }
  }

  status(): string {
    return (
      `Spent: $${usd(this.spentMicros)} | Calls: ${this.calls}/${this.maxCalls} | ` +
      `Remaining: $${usd(Math.max(0, this.maxSpendMicros - this.spentMicros))}`
    );
  }

  snapshot(): { calls: number; spentMicros: number; maxCalls: number; maxSpendMicros: number } {
    return {
      calls: this.calls,
      spentMicros: this.spentMicros,
      maxCalls: this.maxCalls,
      maxSpendMicros: this.maxSpendMicros,
    };
  }
}

function usd(micros: number): string {
  return (micros / 1_000_000).toFixed(2);
}
