# C3 historical GET — peer HTTP boundary review

2026-09-10. Scope: actual exported GET handler, strict result schema and NextResponse, with authentication/rate/reader boundaries mocked. No source edits, live HTTP server, native database, root test suite, build, provider call or activation by reviewer.

## Verdict

**No actionable critical defect found in the reviewed route.** Source SHA256: `8ae249fd84e3754418aa7213cc565aa488ca1df87399d4f724da5ea51670e12a`.

Read the complete route and 72 author tests. Used the Next.js skill, its route-handler/runtime/async references, and installed Next.js guides `15-route-handlers.md`, `route.md`, and `maxDuration.md` before taking task actions. They guided checks for awaited server authentication, Node route conventions, dynamic request handling and explicit cache headers. Platform maxDuration is not cancellation; the route correctly documents its narrower guarantee of preventing late disclosure rather than forcibly interrupting hung authentication.

## Fresh checks

Added only `test/correlated-calendar-approval-result-route-review.test.ts` plus this audit.

Command: `node node_modules/vitest/vitest.mjs run test/correlated-calendar-approval-result-route-review.test.ts test/correlated-calendar-approval-result-route.test.ts`

**86/86 PASS** (14 reviewer + 72 author), started **15:14:17 America/Toronto**, exit 0. Scoped ESLint for the reviewer test also completed exit 0. No new global TypeScript/root/build run was launched for this HTTP review.

The initial 13 reviewer tests passed. Before finalizing, an oracle was strengthened: the extra nested receipt metadata case now first proves the otherwise valid CONFIRMED envelope succeeds, then adds only the forbidden field. A NaN/backward monotone test was split into two concrete cases. No RED product finding is claimed.

## Coverage and limits

- Exact encoded NFD/UTF-16 review IDs survive URL decoding; an NFC-normalized returned identity is rejected. Encoded duplicate keys and extra actor keys refuse before rate/reader calls.
- OFF returns private404 before authentication; unauthenticated malformed query returns private401 without query-validation disclosure. Reader errors are private503 with one fixed message, not reflected details or console logging.
- Actual Zod parsing is used. Getter-triggered abort or REVIEW withdrawal during parsing is caught by final boundary checks. These getter cases are synthetic adversarial tests of the caller boundary, not claims about ordinary database JSON objects.
- Monotone expiration remains enforced after the reader resolves despite a backward wall clock; invalid/backward monotone readings cannot disclose a result.
- Strict nested output rejects an additional approval token instead of stripping it and publishing the rest. Every tested response retains `private, no-store`, `Vary: Cookie, Authorization`, no wildcard CORS and no new session cookie.
- No write/approval route was added. The response is historical metadata, not provider verification or permission to replay an action.

The tests invoke GET directly; they do not prove a real authenticated browser session, Next middleware/proxy behavior, deployed caching, wire-level cancellation, or provider state. Backend owner/immutable-result authority remains in the separately reviewed C3 reader. This is peer code review, not independent model-quality validation or a human-approval observation.
