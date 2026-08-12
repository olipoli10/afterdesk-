/**
 * ONE SERIALISATION, SO THAT TWO IDENTICAL THINGS HASH IDENTICALLY.
 *
 * `JSON.stringify` preserves INSERTION ORDER of object keys. Two objects that
 * are equal in every way a reader cares about therefore produce different
 * bytes, and so different hashes, purely because one was built by a spread and
 * the other by a literal. For a hash whose whole job is to answer "is this the
 * same request / the same capability contract as before", that is not a rounding
 * error: it is the hash saying "different" about something that is not.
 *
 * The failure is silent and it is one-directional in the worst way. A false
 * DIFFERENCE looks like a cache miss and costs a provider call. A false SAMENESS
 * would be worse, but sorting cannot cause one — a key order change is the only
 * thing being normalised away, and no two distinct values collapse.
 *
 * ── WHAT IS NORMALISED, AND WHAT IS DELIBERATELY NOT ──
 *
 * Object keys are sorted, recursively. ARRAY ORDER IS KEPT, always: a message
 * list, a tool list and a column list all mean something different when
 * reordered, and sorting them would make two genuinely different requests hash
 * the same. That is the direction this file must never fail in.
 *
 * `undefined` is dropped from objects and rendered as `null` inside arrays,
 * which is exactly what JSON.stringify does — matching it keeps the output
 * parseable as ordinary JSON rather than a private format.
 */

export function canonicalJson(value: unknown): string {
  return render(value, new WeakSet());
}

function render(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "bigint") {
    // Not JSON-representable, and silently throwing would lose a real value.
    return JSON.stringify(`${value.toString()}n`);
  }
  if (typeof value !== "object") {
    const primitive = JSON.stringify(value);
    // `undefined` and functions stringify to undefined; in a value position
    // the JSON answer is null.
    return primitive === undefined ? "null" : primitive;
  }

  /**
   * A cycle cannot be hashed and must not hang. It also cannot occur in
   * anything this file is pointed at — a request body came off the wire — so
   * it is reported rather than tolerated.
   */
  if (seen.has(value as object)) {
    throw new Error("canonicalJson: the value contains a cycle and cannot be serialised");
  }
  seen.add(value as object);

  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => render(item, seen)).join(",")}]`;
    }
    // Date and friends carry a toJSON; honouring it keeps the output equal to
    // what JSON.stringify would have produced, minus the key ordering.
    const withToJson = value as { toJSON?: () => unknown };
    if (typeof withToJson.toJSON === "function") {
      return render(withToJson.toJSON(), seen);
    }

    const record = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      // Dropped, exactly as JSON.stringify drops it: a key whose value is
      // undefined is a key that is not there.
      if (entry === undefined || typeof entry === "function") continue;
      parts.push(`${JSON.stringify(key)}:${render(entry, seen)}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    seen.delete(value as object);
  }
}
