import { createHash } from "node:crypto";

/**
 * CANONICAL HASHING for the recompute pipeline. Two uses, one algorithm:
 *
 *  - the INPUT fingerprint: a cheap aggregate snapshot of every mutable
 *    source (counts + max(updatedAt/createdAt) + value sums), taken before
 *    the heavy load and RE-TAKEN under the advisory lock. Counts alone are
 *    not enough — a payout re-arm, a session accumulating seconds, or a
 *    refund correction changes a row without changing any count. The value
 *    sums and updatedAt maxima are what catch in-place mutations, and an
 *    integration test mutates a row mid-recompute to prove it;
 *
 *  - the SIGNIFICANT-STATE hash of the actual itself: beforeHash/afterHash
 *    on the operational_actual_recomputed event. Equal hashes mean the
 *    recompute writes NOTHING — the silence is what proves idempotence and
 *    keeps the journal a sequence of real transitions.
 *
 * Canonical form: keys sorted at every depth, bigint → decimal string,
 * Date → ISO, undefined dropped, null kept (null is an answer). sha256 hex.
 */

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("non-finite number has no canonical form");
  }
  return value;
}

export function canonicalHash(value: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}
