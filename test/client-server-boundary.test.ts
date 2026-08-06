import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO CLIENT COMPONENT MAY IMPORT A SERVER-ONLY MODULE.
 *
 * `import "server-only"` throws when a module is pulled into the browser
 * bundle, which is exactly what it is for. The problem is WHEN it throws:
 * only at `next build`. TypeScript has no concept of a bundle boundary, and
 * vitest aliases `server-only` to a stub so the whole test suite stays green.
 * So the two checks that run on every change both miss it, and the failure
 * surfaces minutes later in a build, or in production.
 *
 * This happened for real: the admin plan editor is a client component and
 * needed the closed list of executable primitives for a <select>. Importing
 * it from schemas.ts (server-only, correctly) type-checked, passed 319 tests,
 * and broke the build. The vocabulary now lives in its own dependency-free
 * module, and this test is what keeps it that way.
 */

const SRC = join(__dirname, "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC).map((path) => ({
  path,
  rel: relative(join(__dirname, ".."), path).replace(/\\/g, "/"),
  source: readFileSync(path, "utf8"),
}));

/** Modules that declare themselves server-only, by import path. */
const serverOnly = new Set(
  files
    .filter((f) => /^import ["']server-only["']/m.test(f.source))
    .map((f) => "@/" + f.rel.replace(/^src\//, "").replace(/\.tsx?$/, ""))
);

const clientFiles = files.filter((f) => /^\s*["']use client["']/.test(f.source));

describe("the client bundle never pulls in a server-only module", () => {
  it("finds both sides, so the check below is not vacuous", () => {
    expect(serverOnly.size).toBeGreaterThan(5);
    expect(clientFiles.length).toBeGreaterThan(5);
  });

  it("no 'use client' file imports a VALUE from a server-only module", () => {
    /**
     * `import type` is erased by the compiler and never reaches a bundle, so
     * a client component may freely borrow a type from a server module. Only
     * value imports pull the module in and blow up. Two such type imports
     * exist today and are correct.
     */
    const violations: string[] = [];
    for (const file of clientFiles) {
      for (const match of file.source.matchAll(
        /^\s*import\s+(?!type\s)([\s\S]*?)from\s+["'](@\/[^"']+)["']/gm
      )) {
        // `import { type A, b }` still imports b. `import { type A }` does not.
        const clause = match[1];
        const onlyTypes =
          /^\s*\{[^}]*\}\s*$/.test(clause) &&
          clause
            .replace(/[{}]/g, "")
            .split(",")
            .filter((s) => s.trim().length > 0)
            .every((s) => /^\s*type\s/.test(s));
        if (!onlyTypes && serverOnly.has(match[2])) {
          violations.push(`${file.rel} imports values from ${match[2]}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
