# Explicit approval POST — cross-lane review

2026-09-10, `personal_gateway_subject`. **One reproducible byte-ownership finding
pending author correction at this receipt.** No source/route/SQL/provider edits
or native execution by reviewer. This is cross-lane code review, not independent
model-quality validation.

Read in full: the POST route, its99 author tests, its author audit, and the existing
`personalApiUser` policy. The engineering code-review skill was read and used to
check correctness, identity, stream/resource bounds and disclosure behavior.
Parent explicitly owns policy and authorized the existing absent/native Origin
semantics; this review does not infer stronger CSRF guarantees from them.

Source at RED: `src/app/api/endvera/v1/personal/model/correlated-calendar-reviews/approve/route.ts`,
SHA256 `9bad711e3059c0e0c826aadb70852092d9763deed5817d1a73d2bc2c8e122b3c`.

## Finding: Buffer.slice aliases already-consumed command bytes

**RED observed15:59:33, 6 PASS /1 FAIL** in new
`test/correlated-calendar-approve-route-review.test.ts`.

The route stores each consumed chunk with `next.value.slice()`. For an ordinary
Uint8Array, that copies. For a Buffer, it creates a shared view. A real Request
whose ReadableStream yields Buffer chunks reproduces the difference:

1. First pull provides the valid command prefix without its closing brace.
2. Route consumes that prefix and stores a slice.
3. Second pull overwrites `reviewId:"review"` in the old Buffer with `"victim"`,
   then provides the closing brace. highWaterMark0 fixes this ordering.
4. The typed wrapper receives reviewId victim, despite those bytes having already
   been consumed. The test expects the original command; the ordinary Uint8Array
   control passes under the same ordering.

Narrow correction proposed to author: `Uint8Array.from(next.value)` or equivalent
guaranteed byte copy, keeping4096 byte/chunk limits and all existing checks.
No broad shared-body-reader refactor is needed.

This is a reproducible JavaScript stream-producer ownership defect. It is **not**
a demonstrated remote HTTP exploit, cross-tenant approval or provider action.
The canonical backend still rechecks actor, immutable review/request/fingerprint
and explicit command. The route's claimed consumed-byte snapshot is nonetheless
false for Buffer and should be fixed before integration.

## Other checks / limitations

The six passing peer controls cover ordinary Uint8Array copy isolation, stream
failure after a valid-looking prefix, split UTF-8 without replacement characters,
original-timeout cleanup with an uncooperative body, expiry during response schema
inspection (no late disclosure), and forbidden nested historical approval flags.
Scoped reviewer lint exit0. Auth/rate/wrapper are mocks, Request and streams plus
actual command/response schemas are real. No framework HTTP/session/DB proof is
claimed by these tests.

Code reading found no additional material bypass: both flags OFF before reads;
session actor copied before awaits; trusted origin independent of request Host;
strict command/body cap; no caller approval handles; one wrapper invocation; exact
scope/hash/fingerprint response binding; same original wall/monotone bounds before
and after awaits; unknown/late outcomes never trigger compensating writes/retry.
Body cancellation is not awaited, and zero-byte chunk count is bounded. Auth and
driver promises are not forcibly cancellable here, so an unconditional25s HTTP
completion guarantee is expressly not claimed.

No GREEN verdict or claim of corrected tests is recorded until the author patch
is read and the unchanged failing oracle passes.

## Correction and fresh review receipt

Author replaced only the polymorphic slice with `Uint8Array.from(next.value)` and
an explanatory comment. Entire delta read by reviewer; final route SHA256
`b3fba0ba4c5ceafd69ff4316e992e43bc1e807982256d761f3228c813891bb1b`.
The failing test was not changed. **106/106 PASS** in a separate reviewer run at
**16:02:17** (99 author +7 peer). **GREEN local bounded** after correction; the
earlier RED above remains the historical observation. No C2c executor, shared
body/auth helper or SQL source was modified for this fix.
Fresh global TypeScript check by reviewer subsequently exited0; scoped reviewer
ESLint exited0. Framework/native evidence remains the controller's separate run.
