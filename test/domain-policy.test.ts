import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BLOCKED_PROVIDER_TARGET_DOMAINS,
  isBlockedProviderTargetHost,
  normalizeHostnameForPolicy,
} from "@/lib/net/domain-policy";

/**
 * THE SHARED TARGET POLICY, PINNED IN BOTH DIRECTIONS.
 *
 * The list is pinned BY VALUE because its two edit directions are not
 * symmetric, and neither may happen absent-mindedly. ADDING an entry narrows
 * what every consuming capability can reach — a safety patch, permitted any
 * time, and this pin is updated as part of making that deliberate. REMOVING
 * an entry silently widens what an already-ACCEPTED plan may fetch, with no
 * version bump anywhere — the exact "nothing post-acceptance widens risk"
 * violation the platform is built to refuse — so a removal must arrive
 * together with a version bump of every consuming primitive, and this
 * failing test is the tollbooth where that gets decided by a person.
 */
describe("the blocked target list is pinned by value", () => {
  it("says exactly what research has enforced since 1B", () => {
    expect(BLOCKED_PROVIDER_TARGET_DOMAINS).toEqual([
      "linkedin.com",
      "www.linkedin.com",
      "rocketreach.co",
      "zoominfo.com",
      "apollo.io",
      "signalhire.com",
    ]);
  });
});

describe("one matcher, one semantics: suffix per label", () => {
  it("covers an entry and every subdomain of it", () => {
    expect(isBlockedProviderTargetHost("linkedin.com")).toBe(true);
    expect(isBlockedProviderTargetHost("ca.linkedin.com")).toBe(true);
    expect(isBlockedProviderTargetHost("a.b.zoominfo.com")).toBe(true);
  });

  it("covers hostile spellings of an entry", () => {
    // The traps url-safety.ts documents for its own name check, applied here:
    // case, single and repeated trailing dots.
    expect(isBlockedProviderTargetHost("LINKEDIN.COM")).toBe(true);
    expect(isBlockedProviderTargetHost("LinkedIn.com.")).toBe(true);
    expect(isBlockedProviderTargetHost("linkedin.com..")).toBe(true);
  });

  it("never matches on a lookalike or an embedding", () => {
    // Suffix PER LABEL, not per character: neither a registered lookalike nor
    // a blocked name buried mid-hostname is the blocked target.
    expect(isBlockedProviderTargetHost("evil-linkedin.com")).toBe(false);
    expect(isBlockedProviderTargetHost("linkedin.com.evil.com")).toBe(false);
    expect(isBlockedProviderTargetHost("notzoominfo.com")).toBe(false);
  });

  it("is not vacuous: a legitimate candidate host passes", () => {
    // A wall that blocked everything would pass every hostile assertion
    // above. The policy must also let an ordinary business site through,
    // because letting the fetch happen is the point of the capability.
    expect(isBlockedProviderTargetHost("example.com")).toBe(false);
    expect(isBlockedProviderTargetHost("www.mairie-paris.fr")).toBe(false);
  });

  it("refuses to normalise garbage rather than guessing", () => {
    expect(normalizeHostnameForPolicy("")).toBe(null);
    expect(normalizeHostnameForPolicy("...")).toBe(null);
    expect(normalizeHostnameForPolicy("a..b")).toBe(null);
    expect(normalizeHostnameForPolicy("x".repeat(260))).toBe(null);
    // And the matcher treats an unnormalisable host as "not blocked" on
    // purpose: URL parsing upstream is what refuses it as a TARGET, and a
    // policy module that second-guessed the parser would be a second URL
    // validator drifting from the first.
    expect(isBlockedProviderTargetHost("")).toBe(false);
  });
});

/**
 * THE SHARING IS REFERENTIAL, NOT COPIED. Two consumers with private copies
 * of "the same" list is how ca.linkedin.com ends up blocked on the search
 * path and fetched on the fetch path. Source-level pins, same discipline as
 * capability-substrate.test.ts: the API parameter research passes and the
 * candidate filter fetch applies must both resolve to THIS module.
 */
describe("both provider-side capabilities consume the shared module", () => {
  const src = (rel: string) => readFileSync(join(__dirname, "..", "src", rel), "utf8");

  it("research.web_search's blocked_domains parameter is the shared constant", () => {
    const research = src(join("lib", "ai-work-engine", "primitives", "research.ts"));
    expect(research).toContain(
      'import { BLOCKED_PROVIDER_TARGET_DOMAINS } from "@/lib/net/domain-policy"'
    );
    expect(research).toContain("const BLOCKED_DOMAINS = BLOCKED_PROVIDER_TARGET_DOMAINS");
    expect(research).toContain("blocked_domains: [...BLOCKED_DOMAINS]");
    // And no private copy survives: the old local array literal is gone.
    expect(research).not.toMatch(/BLOCKED_DOMAINS\s*=\s*\[/);
  });

  it("web.fetch's candidate filter is the shared matcher", () => {
    const fetchSource = src(join("lib", "ai-work-engine", "primitives", "fetch.ts"));
    expect(fetchSource).toContain(
      'import { isBlockedProviderTargetHost } from "@/lib/net/domain-policy"'
    );
    expect(fetchSource).toContain("isBlockedProviderTargetHost(parsed.hostname)");
  });

  it("the module stays pure: no imports, no server-only", () => {
    const policy = src(join("lib", "net", "domain-policy.ts"));
    // Real import STATEMENTS, not the words inside the module's own prose.
    expect(policy).not.toMatch(/^import[\s{]/m);
    expect(policy).not.toContain('import "server-only"');
  });
});
