import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ARCHITECTURE PIN — CROSS-CLIENT CONTENT MAY NOT REACH AI OR ANYONE'S SCREEN.
 *
 * Deliberately its own file rather than an entry in price-wall.test.ts. That
 * suite guards RULE 2: two independent prices, enforced by role-shaped Prisma
 * selects that never project the other side's column. This is a different
 * invariant with a different failure mode — content from one client crossing
 * into another client's processing — and filing it under the price wall would
 * blur what each test is actually protecting.
 *
 * ── WHAT THIS PROTECTS ──
 *
 * `findSimilarPricedTasks` used to select `title` and `description` from other
 * clients' tasks and the planner serialised them into an Anthropic prompt. That
 * is fixed, in SQL, and pinned against real Postgres by
 * test/integration/client-isolation.itest.ts.
 *
 * `exceptionMetricsForAdmin` is the one function left whose RETURN VALUE mixes
 * free text from several clients into a single object: its `byField` map
 * aggregates unresolved field names — the clients' own words — across every
 * mandate on the platform. It has no caller today, which is precisely why it
 * needs a guard rather than a comment: an unwired function that already
 * aggregates across clients is one import away from becoming a live path, and
 * the person who adds that import will not be thinking about this.
 *
 * ── WHY AN ALLOWLIST, NOT A BLOCKLIST ──
 *
 * Listing the forbidden surfaces would protect today's AI modules and miss
 * tomorrow's. Admin pages are the only place this data belongs, so admin pages
 * are the only place allowed to reach it. A new pricing module, a new
 * primitive, a new client screen: all covered on the day they are written,
 * without anyone remembering this file exists.
 */

const SRC = join(__dirname, "..", "src");

/** The module holding cross-client telemetry, matched by path and by symbol. */
const RESTRICTED_MODULE = "exception-metrics";
const RESTRICTED_SYMBOL = "exceptionMetricsForAdmin";

/**
 * The only surfaces that may import it. Operator dashboards, and nothing else.
 *
 * Widening this is a real decision: anything added here gets to see field names
 * belonging to clients other than the one whose screen is being rendered. If a
 * future admin SERVER ACTION needs the data, add its exact path and say why —
 * do not relax the rule to "anything called admin".
 */
const ALLOWED_IMPORTERS = [
  join("src", "app", "admin"),
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

/** True when the file is one of the surfaces permitted to import the module. */
function isAllowed(file: string): boolean {
  const rel = relative(join(__dirname, ".."), file);
  return ALLOWED_IMPORTERS.some((prefix) => rel.startsWith(prefix + sep) || rel === prefix);
}

describe("cross-client telemetry cannot reach AI, provider or client-facing code", () => {
  const files = walk(SRC);

  it("the pin is not vacuous — the module and its export still exist", () => {
    // A rename would otherwise silently switch this whole suite off: every
    // assertion below would pass against a codebase that no longer contains
    // the thing being restricted.
    const source = readFileSync(
      join(SRC, "lib", "queries", "exception-metrics.ts"),
      "utf8"
    );
    expect(source).toContain(`export async function ${RESTRICTED_SYMBOL}`);
    expect(files.length).toBeGreaterThan(100);
  });

  it("is imported by nothing outside the admin surface", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith(join("lib", "queries", "exception-metrics.ts"))) continue;
      const source = readFileSync(file, "utf8");
      const importsModule =
        new RegExp(`from\\s+["'][^"']*${RESTRICTED_MODULE}["']`).test(source) ||
        new RegExp(`import\\(\\s*["'][^"']*${RESTRICTED_MODULE}["']`).test(source);
      const namesSymbol = source.includes(RESTRICTED_SYMBOL);
      if ((importsModule || namesSymbol) && !isAllowed(file)) {
        offenders.push(relative(join(__dirname, ".."), file));
      }
    }
    expect(
      offenders,
      [
        `${RESTRICTED_SYMBOL} aggregates client-defined field names across DIFFERENT clients.`,
        "It is admin telemetry only. It must never become context for planning, pricing,",
        "classification, critique, execution, a provider payload, or anything a client or",
        "worker can see.",
        "",
        "If an operator surface genuinely needs it, add that exact path to",
        "ALLOWED_IMPORTERS in this file and record why. If an AI or client-facing module",
        "needs the underlying signal, it needs a different source: a per-task read, or an",
        "aggregate that carries no client wording.",
        "",
        `Offending files:\n${offenders.join("\n")}`,
      ].join("\n")
    ).toEqual([]);
  });

  it("the module still states the restriction at its export", () => {
    // The import guard is the enforcement; this sentence is what tells the next
    // reader why, at the moment they are looking at the function itself.
    const source = readFileSync(
      join(SRC, "lib", "queries", "exception-metrics.ts"),
      "utf8"
    );
    expect(source).toContain("Never use as AI/provider/client context.");
  });
});
