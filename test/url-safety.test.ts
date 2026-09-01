import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_URL_PORTS,
  ALLOWED_URL_SCHEMES,
  classifyUrl,
  isBlockedAddress,
  isBlockedHostname,
  unwrapEmbeddedIpv4,
} from "@/lib/net/url-safety";
import { normalizeUrl } from "@/lib/ai-work-engine/primitives/pure";

/**
 * The guard lands BEFORE the first direct fetch, which is the whole point of
 * doing it in this slice: writing it after the first fetch shipped would mean
 * shipping the hole first and closing it later.
 */

describe("scheme and port allowlists", () => {
  it("only http and https, only 80 and 443", () => {
    expect([...ALLOWED_URL_SCHEMES]).toEqual(["http:", "https:"]);
    expect([...ALLOWED_URL_PORTS]).toEqual([80, 443]);
  });

  for (const raw of [
    "file:///etc/passwd",
    "ftp://example.com/x",
    "gopher://example.com",
    "data:text/html,<script>alert(1)</script>",
    "javascript:alert(1)",
    "ws://example.com",
    "jar:http://example.com!/",
  ]) {
    it(`refuses ${raw.slice(0, 24)}`, () => {
      const r = classifyUrl(raw);
      expect(r.ok).toBe(false);
    });
  }

  it("refuses a scheme-less string rather than completing it", () => {
    // The opposite of what a display formatter does, deliberately.
    expect(classifyUrl("example.com/path").ok).toBe(false);
  });

  it("refuses ports outside the allowlist, including the ones in this deployment", () => {
    // 5432 is DATABASE_URL's, 3310 is CLAMAV_PORT's. A blocklist of 22/25/6379
    // would have missed both.
    expect(classifyUrl("http://example.com:5432/").ok).toBe(false);
    expect(classifyUrl("http://example.com:3310/").ok).toBe(false);
    expect(classifyUrl("http://example.com:8080/").ok).toBe(false);
    expect(classifyUrl("https://example.com:443/x").ok).toBe(true);
    expect(classifyUrl("http://example.com/x").ok).toBe(true);
  });
});

describe("credentials in the URL are rejected, not stripped", () => {
  it("refuses a userinfo section", () => {
    const r = classifyUrl("https://api.hubspot.com@attacker.example/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("credentials_in_url");
  });
  it("refuses a password too", () => {
    expect(classifyUrl("https://user:pass@example.com/").ok).toBe(false);
  });
});

describe("blocked addresses", () => {
  for (const address of [
    "127.0.0.1",
    "127.9.9.9",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "169.254.1.1",
    "100.64.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
  ]) {
    it(`blocks ${address}`, () => expect(isBlockedAddress(address)).toBe(true));
  }

  it("blocks the Azure WireServer, which no private range covers", () => {
    // The single most likely omission: 168.63.129.16 is a PUBLIC address by
    // every RFC1918 test, and it is a metadata endpoint.
    expect(isBlockedAddress("168.63.129.16")).toBe(true);
  });

  it("blocks the other cloud metadata singletons", () => {
    expect(isBlockedAddress("169.254.169.253")).toBe(true);
    expect(isBlockedAddress("100.100.100.200")).toBe(true);
  });

  it("allows ordinary public addresses", () => {
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
  });

  it("blocks IPv6 loopback, unique-local, link-local and multicast", () => {
    expect(isBlockedAddress("::1")).toBe(true);
    expect(isBlockedAddress("fc00::1")).toBe(true);
    expect(isBlockedAddress("fd12:3456::1")).toBe(true);
    expect(isBlockedAddress("fe80::1")).toBe(true);
    expect(isBlockedAddress("ff02::1")).toBe(true);
  });

  it("unwraps IPv4-mapped IPv6 BEFORE testing, in every spelling", () => {
    expect(unwrapEmbeddedIpv4("::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(unwrapEmbeddedIpv4("::ffff:7f00:1")).toBe("127.0.0.1");
    expect(unwrapEmbeddedIpv4("64:ff9b::169.254.169.254")).toBe("169.254.169.254");
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("[::ffff:169.254.169.254]")).toBe(true);
  });

  it("refuses anything it cannot positively classify as a public address", () => {
    // A guard that fails open is not a guard. A NAME is not an address.
    expect(isBlockedAddress("example.com")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
    expect(isBlockedAddress("999.1.1.1")).toBe(true);
  });

  it("FAILS CLOSED on colon-bearing strings it cannot parse as IPv6", () => {
    /**
     * The adversarial review's catch. The first version handed any string
     * containing a colon straight to the prefix matcher, which answers "does
     * this look blocked" — so everything it did not recognise came back
     * ALLOWED, in a function whose contract is the opposite.
     */
    expect(isBlockedAddress(":::::")).toBe(true);
    expect(isBlockedAddress("foo:bar")).toBe(true);
    expect(isBlockedAddress("gggg::1")).toBe(true);
    expect(isBlockedAddress("1:2:3")).toBe(true);
    // And the uncompressed spelling of loopback is still loopback.
    expect(isBlockedAddress("0:0:0:0:0:0:0:1")).toBe(true);
    // A well-formed public address still passes.
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("literal addresses inside a URL are decided without DNS", () => {
  it("blocks a loopback literal", () => {
    const r = classifyUrl("http://127.0.0.1/admin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("literal_blocked_address");
  });

  it("blocks the metadata endpoint spelled as a decimal integer", () => {
    // WHATWG normalises 2130706433 to 127.0.0.1 in `hostname`, and the guard
    // tests the PARSED host precisely so this trick has nothing to exploit.
    expect(classifyUrl("http://2130706433/").ok).toBe(false);
  });

  it("blocks an IPv4-mapped IPv6 literal in brackets", () => {
    expect(classifyUrl("http://[::ffff:127.0.0.1]/").ok).toBe(false);
  });

  it("blocks metadata by NAME as well as by address", () => {
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("anything.internal")).toBe(true);
    expect(isBlockedHostname("db.local")).toBe(true);
    expect(isBlockedHostname("example.com")).toBe(false);
    expect(classifyUrl("http://localhost/x").ok).toBe(false);
  });

  it("strips EVERY trailing dot, not just one", () => {
    // A resolver treats these as the same host; a single .replace(/\.$/) did
    // not, so `localhost..` walked past the name check.
    expect(isBlockedHostname("localhost.")).toBe(true);
    expect(isBlockedHostname("localhost..")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal...")).toBe(true);
    // An empty label anywhere is malformed and refused outright.
    expect(isBlockedHostname("a..b.com")).toBe(true);
  });
});

describe("normalizeUrl never returns an active payload", () => {
  /**
   * The defect this pins: the old catch branch returned the raw string, so a
   * javascript: URL travelled unchanged into the `website` column of the CSV
   * handed to the client, where a spreadsheet makes it clickable.
   */
  for (const hostile of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "ftp://example.com/x",
  ]) {
    it(`drops ${hostile.slice(0, 20)} rather than passing it through`, () => {
      const out = normalizeUrl(hostile);
      expect(out).toBe("");
      expect(out).not.toContain("javascript");
      expect(out).not.toContain("data:");
      expect(out).not.toContain("file:");
    });
  }

  it("still normalises ordinary input", () => {
    expect(normalizeUrl("Example.COM/Path/")).toBe("https://example.com/Path");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeUrl("  ")).toBe("");
  });

  it("drops a string that parses to no host", () => {
    expect(normalizeUrl("https://")).toBe("");
  });
});

/**
 * ARCHITECTURE PIN. No direct outbound HTTP exists in the work engine today,
 * and none may appear without going through a module that consumes the
 * predicates above. This test is what makes the ordering real rather than a
 * good intention: the first person to add `fetch(` here has to deal with the
 * guard, because the build stops otherwise.
 */
describe("no direct outbound fetch may enter the work engine unguarded", () => {
  const ENGINE_DIR = join(__dirname, "..", "src/lib/ai-work-engine");

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : [];
    });
  }

  it("finds no fetch(, axios or undici call in any engine file", () => {
    const offenders: string[] = [];
    for (const file of walk(ENGINE_DIR)) {
      const source = readFileSync(file, "utf8");
      if (/\bfetch\s*\(|\baxios\b|from "undici"|require\("undici"\)/.test(source)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `Direct outbound HTTP appeared in the work engine. Route it through a module that applies src/lib/net/url-safety.ts (and, before the first real fetch, the pinned-DNS layer that guard is written for).\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});

/**
 * 1E-beta1 WIDENS THE SCAN TO ALL OF src/. The engine-only walk above stays
 * (zero tolerance there), but the most plausible home for a future direct
 * fetch layer is src/lib/net or src/server — exactly the directories the old
 * scan never visited. So: every file under src/ is walked, and direct HTTP is
 * an ALLOWLIST of named files, each there for a reason a reviewer can check.
 * A new fetch( anywhere else fails the build and forces the conversation.
 *
 * web.fetch itself is deliberately NOT in this list: it reaches the web
 * through the provider's server-side tool via the SDK, and our process opens
 * no socket to any target — which is why url-safety.ts stays a dormant
 * decision core even after beta1 ships.
 */
describe("direct outbound HTTP anywhere in src/ is an allowlist", () => {
  const SRC_DIR = join(__dirname, "..", "src");

  /** Files whose fetch( is reviewed and legitimate: first-party API calls
   *  (mail, embeddings, malware scanning) and browser-side uploads. None of
   *  them takes a URL derived from client text or model output — the
   *  Cloudmersive endpoint in file-security.ts is a fixed, code-controlled
   *  constant, never a value from a request. authz.ts is deliberately NOT
   *  here: its only "fetch(" was a word in a comment, and an allowlist entry
   *  bought by prose would have exempted the auth module — the worst possible
   *  file — from this scan forever. */
  const DIRECT_HTTP_ALLOWLIST = [
    join("src", "components", "file-upload.tsx"),
    join("src", "components", "payment-actions.tsx"),
    join("src", "components", "quote-actions.tsx"),
    join("src", "lib", "email.ts"),
    join("src", "lib", "embeddings.ts"),
    join("src", "lib", "file-security.ts"),
  ];

  /**
   * Comment-stripped view of a source file. Both checks below run on CODE:
   * a `fetch(` in prose must neither flag a file as an offender nor satisfy
   * the vacuity check — the latter is how a stale comment could keep a dead
   * allowlist entry alive while a real call slipped in beside it. Whole-line
   * `//` comments only, so "https://…" inside string literals survives.
   */
  const codeOnly = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  function walkAll(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory()
        ? walkAll(full)
        : /\.tsx?$/.test(entry)
          ? [full]
          : [];
    });
  }

  it("no file outside the allowlist contains fetch(, axios or undici", () => {
    const offenders: string[] = [];
    for (const file of walkAll(SRC_DIR)) {
      const source = codeOnly(readFileSync(file, "utf8"));
      if (!/\bfetch\s*\(|\baxios\b|from "undici"|require\("undici"\)/.test(source)) continue;
      const rel = relative(join(__dirname, ".."), file);
      if (!DIRECT_HTTP_ALLOWLIST.includes(rel)) offenders.push(rel);
    }
    expect(
      offenders,
      "Direct outbound HTTP appeared outside the reviewed allowlist. If this " +
        "is the future direct-fetch layer, it must consume url-safety.ts AND " +
        "domain-policy.ts and prove per-redirect revalidation before joining " +
        "the list; if it is anything else, it probably belongs behind an " +
        "existing client.\n" +
        offenders.join("\n")
    ).toEqual([]);
  });

  it("is not vacuous: the allowlisted files exist and really do call out, in CODE", () => {
    for (const rel of DIRECT_HTTP_ALLOWLIST) {
      const source = codeOnly(readFileSync(join(__dirname, "..", rel), "utf8"));
      expect(/\bfetch\s*\(|\baxios\b/.test(source), `${rel} no longer calls out; prune it`).toBe(
        true
      );
    }
  });
});
