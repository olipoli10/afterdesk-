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
 * NO IMPORTS. The firewall must be testable without a database, a network or
 * the provider SDK, and nothing it depends on may be able to spend money.
 */

export type TestProviderMode = "replay" | "synthetic" | "live";

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
};

export class ProviderBudget {
  readonly label: string;
  readonly maxCalls: number;
  readonly maxSpendMicros: number;
  readonly callReserveMicros: number;
  private calls = 0;
  private spentMicros = 0;

  constructor(opts: BudgetOptions, env: BudgetEnv = {}) {
    this.label = opts.label;
    this.maxCalls = opts.maxCalls ?? positiveInt(env.TEST_PROVIDER_MAX_CALLS, DEFAULT_MAX_CALLS);
    this.maxSpendMicros =
      opts.maxSpendMicros ??
      positiveInt(env.TEST_PROVIDER_MAX_SPEND_MICROS, DEFAULT_MAX_SPEND_MICROS);
    this.callReserveMicros = opts.callReserveMicros ?? DEFAULT_CALL_RESERVE_MICROS;
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
    if (this.calls >= this.maxCalls) {
      throw new ProviderBudgetExceeded(
        `[${this.label}] call cap reached: ${this.calls}/${this.maxCalls}. ${this.status()}`
      );
    }
    const projected = this.spentMicros + Math.max(0, estimateMicros);
    if (projected > this.maxSpendMicros) {
      throw new ProviderBudgetExceeded(
        `[${this.label}] spend cap would be crossed: $${usd(this.spentMicros)} spent + ` +
          `$${usd(estimateMicros)} reserved > $${usd(this.maxSpendMicros)} cap. ${this.status()}`
      );
    }
    this.calls += 1;
  }

  /** Settle the reservation with what the call actually cost. */
  settle(actualMicros: number): void {
    this.spentMicros += Math.max(0, actualMicros);
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
