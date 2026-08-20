/**
 * URL AND ADDRESS SAFETY — pure predicates, no network, no DNS, no server-only.
 *
 * WHAT THIS FILE IS FOR, AND WHAT IT IS DELIBERATELY NOT.
 *
 * Phase 1D-alpha0 activates NO direct HTTP fetch. Everything the work engine
 * reaches today goes through the Anthropic SDK, which applies robots.txt and
 * blocks private addresses on its own side. So there is no `pinnedFetch` here:
 * a network client with no caller is dead code pretending to be a defence.
 *
 * What DOES exist here is the decision core that a future fetch must be built
 * on, plus the hostile tests that pin it. The rule the architecture test
 * enforces (test/url-safety.test.ts) is simple: no direct outbound HTTP may
 * appear in the work engine without going through a module that consumes these
 * predicates. The order matters — the guard lands before the first fetch, not
 * after it.
 *
 * ── WHY NAME VALIDATION IS NOT ENOUGH, WRITTEN DOWN SO IT IS NOT REDISCOVERED ──
 *
 * Validating a hostname and then handing the NAME to an HTTP client resolves
 * DNS twice: once here, once in the client's connector. Nothing guarantees the
 * two answers match. Three separate mechanisms exploit that gap:
 *
 *   1. DNS rebinding — the attacker's authoritative server answers TTL=0, a
 *      public address first (the check passes) then 127.0.0.1 (the socket
 *      opens on loopback). No HTTP redirect is involved at all.
 *   2. Multiple records — a lookup returns one address, the connector may pick
 *      another from the same RRset.
 *   3. Different resolvers or caches between the checker and the connector.
 *
 * The only sound construction is ADDRESS PINNING: resolve once, validate EVERY
 * returned address, then connect to the validated address rather than to the
 * name. That is a property of the fetch layer, and it is a hard prerequisite
 * of the first direct fetch — recorded here rather than half-built.
 */

/** Schemes an outbound fetch may ever use. An allowlist, never a blocklist. */
export const ALLOWED_URL_SCHEMES = ["http:", "https:"] as const;

/**
 * Ports an outbound fetch may ever reach. Also an allowlist: blocking 22, 25
 * and 6379 is whack-a-mole, and in THIS deployment the ports that matter are
 * 5432 (the Postgres in DATABASE_URL) and 3310 (CLAMAV_PORT). Naming the bad
 * ones would have missed both.
 */
export const ALLOWED_URL_PORTS = [80, 443] as const;

export type UrlRejectionReason =
  | "unparseable"
  | "scheme_not_allowed"
  | "credentials_in_url"
  | "host_syntax"
  | "port_not_allowed"
  | "literal_blocked_address"
  | "blocked_hostname";

export type UrlClassification =
  | { ok: true; url: URL; host: string; port: number }
  | { ok: false; reason: UrlRejectionReason };

/**
 * Hostnames refused before any resolution is attempted. Cloud metadata
 * services answer on names as well as addresses, and a name check costs
 * nothing. This is a supplement to the address table, never a substitute:
 * an attacker controls their own DNS and can point any name anywhere.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

const BLOCKED_HOST_SUFFIXES = [".localhost", ".internal", ".local"];

/**
 * Cloud metadata addresses, named explicitly even where a range already covers
 * them. 168.63.129.16 is the one that matters: Azure's WireServer sits OUTSIDE
 * every classic private range, so a table built only from RFC1918 plus
 * link-local lets it through.
 */
const BLOCKED_IPV4_SINGLETONS = new Set([
  "169.254.169.254", // AWS / GCP / Azure / DigitalOcean / Oracle IMDS
  "169.254.169.253", // AWS VPC DNS
  "169.254.169.123", // AWS NTP
  "168.63.129.16", // Azure WireServer — outside the private ranges
  "100.100.100.200", // Alibaba
]);

type Cidr = { base: number; bits: number };

function ipv4ToInt(parts: number[]): number {
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function cidr(literal: string, bits: number): Cidr {
  const parts = literal.split(".").map((p) => Number(p));
  return { base: ipv4ToInt(parts), bits };
}

/** Every IPv4 range an outbound fetch must refuse. */
const BLOCKED_IPV4_RANGES: Cidr[] = [
  cidr("0.0.0.0", 8),
  cidr("10.0.0.0", 8),
  cidr("100.64.0.0", 10), // CGNAT
  cidr("127.0.0.0", 8),
  cidr("169.254.0.0", 16), // link-local, contains IMDS
  cidr("172.16.0.0", 12),
  cidr("192.0.0.0", 24),
  cidr("192.0.2.0", 24),
  cidr("192.88.99.0", 24),
  cidr("192.168.0.0", 16),
  cidr("198.18.0.0", 15),
  cidr("198.51.100.0", 24),
  cidr("203.0.113.0", 24),
  cidr("224.0.0.0", 4), // multicast
  cidr("240.0.0.0", 4), // reserved, includes 255.255.255.255
];

/**
 * Parse a strict dotted-quad. Deliberately strict: "01.02.03.04" and
 * "1.2.3.4.5" are refused rather than coerced. Decimal and hex literals
 * (http://2130706433/) are NOT handled here because WHATWG `new URL` already
 * normalises them to dotted-quad in `hostname` — the classification path
 * always tests the PARSED host, never the raw string, and a test pins that.
 */
function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    const n = Number(part);
    if (n > 255) return null;
    nums.push(n);
  }
  return nums;
}

/**
 * Unwrap the IPv4 hiding inside an IPv6 form, and return it as a dotted quad.
 * `[::ffff:127.0.0.1]` is the single most common way past a guard that only
 * looks at IPv6 text, so unwrapping happens BEFORE any IPv6 range test and the
 * result is re-tested against the IPv4 table.
 */
export function unwrapEmbeddedIpv4(host: string): string | null {
  const h = host.toLowerCase();
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (mapped) return mapped[1];
  // ::ffff:7f00:1 — the hex spelling of the same thing.
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }
  // 64:ff9b::/96 NAT64 carries an IPv4 in its last 32 bits.
  const nat64 = /^64:ff9b::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (nat64) return nat64[1];
  // Equivalent NAT64 spellings must share one address decision. Parse the
  // groups structurally rather than matching only the compressed text.
  const nat64Groups = expandIpv6(h);
  if (
    nat64Groups !== null &&
    nat64Groups[0] === 0x0064 &&
    nat64Groups[1] === 0xff9b &&
    nat64Groups.slice(2, 6).every((group) => group === 0)
  ) {
    const hi = nat64Groups[6];
    const lo = nat64Groups[7];
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }
  return null;
}

/**
 * Expand an IPv6 address to its eight 16-bit groups.
 *
 * Prefix matching MUST happen on the expanded form. Testing the text meant
 * `::1` was caught while `0:0:0:0:0:0:0:1` — the same address, uncompressed —
 * was not, because the string did not start with the literal the pattern
 * expected. Loopback spelled the long way is still loopback.
 */
function expandIpv6(host: string): number[] | null {
  const h = host.toLowerCase();
  const [head, tail] = h.includes("::") ? h.split("::") : [h, null];
  const toGroups = (part: string): number[] =>
    part === "" ? [] : part.split(":").map((g) => parseInt(g, 16));
  const left = toGroups(head);
  const right = tail === null ? [] : toGroups(tail);
  if (tail === null) return left.length === 8 ? left : null;
  const fill = 8 - left.length - right.length;
  if (fill < 0) return null;
  const groups = [...left, ...Array<number>(fill).fill(0), ...right];
  return groups.length === 8 && groups.every((g) => Number.isFinite(g)) ? groups : null;
}

/** IPv6 prefixes refused outright, tested after IPv4 unwrapping. */
function isBlockedIpv6(host: string): boolean {
  const g = expandIpv6(host);
  // Unparseable reaches here only via a caller that already checked the
  // shape, but failing closed costs nothing and a future caller may not.
  if (g === null) return true;

  const allZero = g.every((x) => x === 0);
  if (allZero) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1

  const first = g[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (first === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true; // 100::/64 discard
  if (first === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (first === 0x2001 && g[1] === 0) return true; // Teredo 2001::/32
  if (first === 0x2002) return true; // 6to4
  return false;
}

/**
 * Is this literal address one an outbound fetch must never reach?
 *
 * Takes an ADDRESS, not a name: this is the predicate a future pinned fetch
 * applies to every record DNS returned, before it opens a socket. Anything
 * it cannot positively classify as a public address is refused, because a
 * guard that fails open is not a guard.
 */
export function isBlockedAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, "").trim();
  if (bare === "") return true;

  const embedded = unwrapEmbeddedIpv4(bare);
  if (embedded !== null) return isBlockedAddress(embedded);

  const v4 = parseIpv4(bare);
  if (v4 !== null) {
    if (BLOCKED_IPV4_SINGLETONS.has(bare)) return true;
    const value = ipv4ToInt(v4);
    for (const range of BLOCKED_IPV4_RANGES) {
      const mask = range.bits === 0 ? 0 : (0xffffffff << (32 - range.bits)) >>> 0;
      if ((value & mask) >>> 0 === (range.base & mask) >>> 0) return true;
    }
    return false;
  }

  if (bare.includes(":")) {
    /**
     * FAIL CLOSED ON ANYTHING THAT DOES NOT PARSE AS IPv6.
     *
     * The first version returned isBlockedIpv6(bare) directly, and that
     * function answers "does this match a blocked prefix" — so every string
     * containing a colon that it did not recognise came back FALSE, meaning
     * allowed. `:::::`, `foo:bar` and the uncompressed `0:0:0:0:0:ffff:7f00:1`
     * spelling of loopback all sailed through a guard whose own contract says
     * it refuses what it cannot classify.
     */
    if (!isWellFormedIpv6(bare)) return true;
    return isBlockedIpv6(bare);
  }

  // Not an address at all. Callers must resolve first; treating a name as
  // "not blocked" here would be read as approval.
  return true;
}

/**
 * Eight groups of up to four hex digits, or fewer with exactly one `::`.
 * Strict on purpose: a form this cannot verify is refused by the caller.
 */
function isWellFormedIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (!/^[0-9a-f:.]+$/.test(h)) return false;
  const doubleColons = h.split("::").length - 1;
  if (doubleColons > 1) return false;
  const groups = h.split(":").filter((g) => g !== "");
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(g))) {
    return false;
  }
  if (doubleColons === 0) {
    const parts = h.split(":");
    // 8 groups, or 7 with a trailing dotted quad (which occupies two).
    const hasQuad = /\d{1,3}(\.\d{1,3}){3}$/.test(h);
    return parts.length === (hasQuad ? 7 : 8);
  }
  return groups.length <= 8;
}

/**
 * A hostname refused before resolution is even attempted.
 *
 * Trailing dots are stripped REPEATEDLY and empty labels are refused:
 * `localhost..` and `metadata.google.internal..` are the same hosts to a
 * resolver, and a single `.replace(/\.$/)` left both of them un-matched.
 */
export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.+$/, "");
  if (h === "") return true;
  if (h.split(".").some((label) => label === "")) return true;
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

/**
 * The syntactic half of the pipeline: everything decidable without touching
 * the network. A caller that gets `ok: true` still MUST resolve the host and
 * run every returned address through isBlockedAddress before connecting.
 * That second half belongs to the fetch layer and does not exist yet.
 */
export function classifyUrl(raw: string): UrlClassification {
  let url: URL;
  try {
    // No scheme guessing. A string without a scheme is rejected, never
    // completed — the opposite of what a display formatter does.
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "unparseable" };
  }

  if (!(ALLOWED_URL_SCHEMES as readonly string[]).includes(url.protocol)) {
    return { ok: false, reason: "scheme_not_allowed" };
  }

  // REJECTED, not stripped. `https://api.example.com@attacker.tld/` misleads a
  // human reader and some logs; and silently deleting a credential destroys
  // something without saying so.
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "credentials_in_url" };
  }

  const host = url.hostname;
  if (host === "" || host.length > 253 || /[\s\\@ -]/.test(host)) {
    return { ok: false, reason: "host_syntax" };
  }

  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  if (!(ALLOWED_URL_PORTS as readonly number[]).includes(port)) {
    return { ok: false, reason: "port_not_allowed" };
  }

  if (isBlockedHostname(host)) return { ok: false, reason: "blocked_hostname" };

  // A literal address in the URL is decidable right now, without DNS. A NAME
  // is not, and stays for the resolution step.
  const looksLikeLiteral = parseIpv4(host) !== null || host.includes(":");
  if (looksLikeLiteral && isBlockedAddress(host)) {
    return { ok: false, reason: "literal_blocked_address" };
  }

  return { ok: true, url, host, port };
}
