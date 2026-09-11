# Personal model operator HTTP B3 — independent peer review

Verdict: **GREEN, bounded local HTTP-seam review**, 2026-09-11.
No production source was edited by this reviewer. No HTTP server, database,
provider, real secret, deployment or activation was exercised.

## Scope and instructions

Read the complete B3 admission, route, HTTP helper and author tests, and the
actual `getSessionUser` / `consumeRateLimit` implementations. The engineering
code-review skill organized the security/correctness review. The Next.js skill,
its route/async/runtime references and the installed route-handler guide were
read before writing the separate reviewer tests. No framework upgrade or shared
auth change was requested.

Reviewed files:

- `src/app/api/endvera/v1/personal/model/operator-setup/route.ts`
- `src/server/model-gateway/personal-intent/operator-http.ts`
- `test/personal-model-operator-route.test.ts`
- `test/personal-model-operator-http.test.ts`

Owned counter-tests: `test/personal-model-operator-route-review.test.ts`.

## Reproduced RED and correction

At **22:47:25 local runner time**, the new 15-case suite produced **12 PASS /
3 FAIL**, with an explicit successful setup control:

1. A mocked session with `emailVerified: "false"` reached the setup seam.
2. A mocked limiter returning `"false"` was treated as admission.
3. Mutation of the returned session object during the limiter await changed the
   actor passed downstream to a foreign user / ADMIN / unverified tuple, despite
   validation of the original owner immediately before that await.

These are JS seam/contract failures, **not demonstrated DB authorization bypasses**.
The real session helper normalizes verification to Boolean, the real limiter
returns Boolean, and B2 independently validates the actor/current DB authority.
The tests deliberately simulate violated dependency contracts and shared-object
mutation; no remote exploit or tenant disclosure is claimed.

Controller fixed only strict `=== true` admission and an immutable primitive actor
snapshot before the limiter await; the quota key now derives from that snapshot.
The three original failing assertions were retained unchanged. Initial route SHA:
`c72c7bdb8553deceb768777f3feecf12412f4eb84525a29958485d754d47165e`.

## Final independent verification

At **22:48:34**, safeEnvironment execution of the actual three named test files
passed **80/80**: reviewer 15 + route author 38 + HTTP-reader author 27. This is not
a global-root, native DB or deployed framework result. Controller owns type/lint
and broader validation; no duplicate TypeScript/root/native run was started here.

The counter-tests additionally cover real Request/ReadableStream Buffer copying,
hung read/cancel abortion, dependency error-accessor noninspection, UNKNOWN after
dispatch abort, monotonic expiry during JSON serialization, original signal
capture, GET origin refusals, percent-encoded duplicate selectors, fixed error
bodies and absence of cookies/CORS/cache permission in failures.

Final SHA256:

- Route: `32af91c0268230063d09d5ff1833f7db377f5a6e8eef0c004221bb77efc49e27`
- HTTP helper: `066d244a22367b04f2fa673780dc355dc0667fe70d1837da828a4cc692815290`
- Reviewer test: `59ddb16fc8e869c0edd5aaca589beb8086bd624b9183bee5d9b76142a1aefedb`

The B1 config parser and B2 publication/DB functions are explicit test doubles in
this reviewer suite. Therefore it does not independently prove their integrity,
current owner checks, known COMMIT or receipt registration. Other suites own
those proofs. Body parsing and HTTP deadlines are real here. Hung auth/limiter
dependencies are not hard-cancelled; post-await checks prevent late progression
or disclosure, not a guaranteed 15-second end-to-end HTTP response. JavaScript
secret strings cannot be certified securely erased. No additional concrete
blocking defect remained in the reviewed scope.
