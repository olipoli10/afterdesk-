/**
 * THE ONE LIST OF WEB TARGETS NO PROVIDER-SIDE CAPABILITY MAY TOUCH.
 *
 * Pure on purpose: no imports, no network, no `server-only`, exactly like
 * url-safety.ts, so the compiler, the tests and every adapter can read it
 * without dragging a server module graph behind them.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * Until 1E-beta the blocked-domain list was a private constant inside
 * research.ts. One consumer, one copy: fine. web.fetch is a second consumer,
 * and two provider-side capabilities each holding their own list is exactly
 * how ca.linkedin.com ends up blocked on one path and fetched on the other.
 * The list moves here; both capabilities import it; a test pins research.ts's
 * API parameter to this very constant so the sharing is referential, not
 * copied.
 *
 * ── WHAT THIS LIST IS NOT ──
 *
 * It is TARGET IDENTITY policy, not network-location policy. url-safety.ts
 * answers "may OUR process open a socket to this address" (SSRF: loopback,
 * RFC1918, metadata endpoints) and guards a direct-fetch layer that does not
 * exist yet. This list answers "which public sites will we not read, whoever
 * does the reading", and it is enforced as PROVIDER API PARAMETERS
 * (blocked_domains on search, an allowed_domains subtraction on fetch),
 * because the provider's HTTP client is the one doing the fetching and our
 * socket predicates never see it.
 *
 * ── EDITING THIS LIST IS ASYMMETRIC, AND THE ASYMMETRY IS THE DOCTRINE ──
 *
 * ADDING an entry NARROWS what every capability may reach. That is a safety
 * patch: it may ship any time, and accepted contracts getting the narrower
 * behaviour is the correct direction (a mandate never gains risk by us
 * blocking more).
 *
 * REMOVING an entry WIDENS what an already-accepted plan may fetch, silently,
 * with no version bump — which is precisely the "nothing post-acceptance may
 * widen risk" invariant this platform is built on. So a removal is a
 * BEHAVIOUR CHANGE of every primitive that consumes the list and requires a
 * version bump of each (research.web_search, web.fetch), with the accepted
 * plans pinned to the old versions degrading to human work as the vocabulary
 * doctrine prescribes. test/domain-policy.test.ts pins the entries by value
 * so neither direction can happen absent-mindedly.
 */

export const BLOCKED_PROVIDER_TARGET_DOMAINS = [
  /**
   * LinkedIn's User Agreement forbids automated access and hiQ v. LinkedIn
   * ended in a breach-of-contract judgment; docs/VERIFIED-PROSPECT-STANDARD.md
   * records that LinkedIn corroboration is a HUMAN step here. Legal-risk
   * entry, distinct in kind from the quality entries below: a future
   * allowlist decision may treat the two differently, which is why each entry
   * carries its reason.
   */
  "linkedin.com",
  "www.linkedin.com",
  // Aggregators that resell scraped contact data: citing them would let a
  // delivery claim a source it cannot stand behind. Quality entries.
  "rocketreach.co",
  "zoominfo.com",
  "apollo.io",
  "signalhire.com",
] as const;

/**
 * Hostname normalisation for MATCHING ONLY, mirroring the traps url-safety.ts
 * already documents: trailing dots are stripped REPEATEDLY ("linkedin.com.."
 * must not walk past the check), case is folded, and an empty result refuses
 * to match anything by returning null so the caller fails closed.
 *
 * Punycode homographs are out of scope on purpose: they equally evade the
 * provider's own blocked_domains matching, so a local unicode-folding pass
 * would claim a parity the enforcement layer does not have.
 */
export function normalizeHostnameForPolicy(hostname: string): string | null {
  let h = hostname.trim().toLowerCase();
  while (h.endsWith(".")) h = h.slice(0, -1);
  if (h.length === 0 || h.length > 253) return null;
  if (h.split(".").some((label) => label.length === 0)) return null;
  return h;
}

/**
 * Suffix-per-label matching, the same semantics the provider applies to
 * blocked_domains: an entry covers itself and every subdomain, and covers
 * NOTHING that merely ends with the same letters. `ca.linkedin.com` is
 * blocked; `evil-linkedin.com` is not; `linkedin.com.evil.com` is not.
 *
 * This is the ONE matcher every consumer must use. A second implementation
 * with its own idea of "suffix" is how the two paths diverge.
 */
export function isBlockedProviderTargetHost(hostname: string): boolean {
  const host = normalizeHostnameForPolicy(hostname);
  // Unparseable hostnames match nothing here; the caller's own URL parsing
  // is what refuses them as targets. Returning true would make this module
  // a second URL validator, which it is not.
  if (host === null) return false;
  return BLOCKED_PROVIDER_TARGET_DOMAINS.some(
    (entry) => host === entry || host.endsWith("." + entry)
  );
}
