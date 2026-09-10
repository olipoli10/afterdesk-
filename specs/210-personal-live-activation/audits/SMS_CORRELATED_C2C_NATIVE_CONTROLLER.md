# Same-executor approval — controller native evidence

2026-09-10. Local synthetic choice, real PostgreSQL and real encrypted-token
loader with a fresh random synthetic key; actual Google client with injected
HTTP only. No real Google/Twilio transport, human approval or Samsung proof.

## Frozen sources and reviews

calendar-actions SHA256
`4fe68c46a386e684bac1d2d988b67dfe947ff6be0bb64e89707452a22e0b89b9`;
correlated-calendar-approval SHA256
`ea5f2bc79b35627236f1ac2a593a797dceecdf3af16cf5645079773a5fe638a2`.
Controller read both final source deltas, actual vault/client/token-loader, new
native cases, author and peer tests/audits. Author188 and peer74 targeted passes
are separate code-review evidence, not independent model-quality validation.

POST route's Buffer.slice shared-byte defect was reproduced by the peer, then
fixed to Uint8Array.from without changing its oracle: author/reviewer106 PASS.
Controller read entire final route,99 author and7 peer tests, audits. Final POST
SHA256 `b3fba0ba4c5ceafd69ff4316e992e43bc1e807982256d761f3228c813891bb1b`.

## Native run history

- `postgres-native-1789070126831`:169 PASS /1 FAIL,19:57:18.059Z, owned server
  STOPPED. The expiry sentinel was asserted immediately after the executor
  returned UNKNOWN, but the deliberately non-aborting fake transport was still
  waiting for real DB expiry. This was a premature test assertion, not evidence
  that a late provider response was confirmed. The failure is retained.
- Fixture-only change retains the injected response Promise and awaits it after
  the executor has already returned UNKNOWN, before asserting DB clock>=expiry.
  This also exposes errors in the bounded DB wait rather than swallowing them.
  No original action deadline, product source or SQL guard was extended.
- Added a distinct terminal-commit ACK-loss case: await the real transaction,
  read its completed row, then throw the synthetic ACK error. Require the commit
  sentinel, stored CONFIRMED, C3 CONFIRMED, repeated wrapper ALREADY_ATTEMPTED and
  exactly one injected HTTP call. Cleanup cannot rewrite that committed row.
- `postgres-native-1789070541270`:171/171 PASS,20:04:49.833Z, owned server STOPPED,
  retained cluster9ffa7fc231004e99b14ac6c45311bf2a. Nine new C2c cases include
  three DB session zones, real encrypted synthetic token loading, correct exact
  deterministic event receipt, failed transport, claim ACK loss after actual
  commit, concurrent wrappers, READ revocation while HTTP is pending, late reply
  after original expiry, and terminal ACK loss. Counting three zones separately
  yields nine cases. No token/key value is recorded in evidence.

The READ revocation happens through a real DB writer awaited by the injected
HTTP promise. Its completion proves that the executor does not retain its
admission SHARE locks while awaiting the network response. The concurrent
wrappers test does not itself force lock overlap; earlier C2b two-PID barrier
evidence supplies that distinct property.

The individual-offer post-commit expiry sentinel strengthened after native162
also passes in native171. Whole-history comparisons exclude credentials/grants
explicitly changed by fixture setup/revocation; they cover the canonical
operations, questions, replies, reviews, approvals and reservation history.

## Whole-suite and continuation

`root-1789070608376`:6003 PASS and3 historical skips,421 passing files,
20:05:04.850Z. The three skips are the old founder/PostgreSQL suites, not newly
waived cases. Fresh full20-clone native suite367/367 PASS20:10:16.995Z,
`postgres-native-1789070733399`, owned server STOPPED. All20 per-file receipts
have migration fingerprint `79:41de317b70655965d494f1c3e0ea5940`. Counts were
summed from the20 actual runner summaries, not extrapolated from targeted171.

Fresh build `build-1789070619221` PASS20:06:56.129Z, BUILD_ID
`WLptYVncl09hX0E7DBmfx`. Actual loopback HTTP probes against that build:
offer7 PASS20:07:52.649Z (`correlated-calendar-approval-offer-http-1789070872650`),
POST7 PASS20:07:55.780Z (`correlated-calendar-approve-http-1789070875781`). Both
owned servers stopped and ports independently refused TCP connections. OFF404
responses are opaque/private/no-store with Vary Cookie,Authorization; the
framework's method405/OPTIONS responses have their observed framework headers,
not the custom cache-header claim. Exact method sets GET/HEAD/OPTIONS versus
OPTIONS/POST are confirmed. No configured database, authenticated HTTP or
provider execution in these probes. Mobile is not verified by this web build.

SQL78/79 remain immutable, local79 and remote70 unchanged. Mobile implementation
is released after native171: one exact returned offer, explicit gesture,
metadata-only persist-before-POST and C3-only recovery. No rubric transition:
roadmap22%, localbuild46.75%, C2 preparation18of18, real-test NO-GO, Verified-E2E0%.
