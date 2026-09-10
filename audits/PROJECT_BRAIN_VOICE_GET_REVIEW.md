# Project Brain voice GET — bounded code cross-review

2026-09-10. Scope: the new protected GET route only, not mobile UI or R2.
Read the complete ASR_PROJECT_BRAIN_TRANSCRIPT_REVIEW_PLAN including its approved
GET addendum, route, author tests, session-user helper and installed Next route
handler reference. Engineering code-review skill guided authorization, await,
error and cache-boundary checks. Reviewer changes only this audit and
test/project-brain-voice-review-route-review.test.ts.

## Verdict

GREEN within the direct-handler scope; no actionable defect reproduced.
Exact OFF flag is checked before downstream work and after every awaited gate.
Actor identity comes from the session and is copied before limiter latency;
query/body/header actor assertions cannot substitute for it. Verified application
CLIENT is necessary but not asserted to be sufficient: the canonical R1 reader
still performs current workspace-owner/source/result/expiry checks.

Both query IDs are bounded, exact and single-valued; decoded duplicate/unknown
keys refuse. Explicit rate-limit true is required before reader access. Reader
success must pin the requested workspace/session and all synthetic/no-authority
labels. Exceptions and result serialization failure expose neither SQL nor text.
Explicit responses use private,no-store and Vary Cookie,Authorization. No route
mutation/dispatch export exists and no provider call is introduced.

The canonical service currently returns immutable bounded JSON with exact
producer text. The route's label checks are not a standalone arbitrary-object
sanitizer or a second proof verifier. No claim is made that a compromised service
returning arbitrary additional properties is safe.

## Fresh tests

14 new reviewer cases add explicit rejection of spoofed identity headers when
unauthenticated; five non-boolean-true limiter returns; successful request then
logout without cached disclosure; query snapshot before limiter await; four
missing negative authority/quality labels; exact JSON whitespace and no implicit
wildcard CORS; rejected protected read with simultaneous OFF returns opaque404.

Fresh run11:38:42: **79/79 PASS**, comprising14 reviewer route cases +54 author
route cases +11 existing R1 boundary cases. Full TypeScript and scoped ESLint on
both active reviewer test files pass afterward. These tests directly call the
handler with mocked authentication/rate/service; no HTTP server, Next build,
browser, device, DB, provider or customer data was used.

The separately recorded controller R1 native12/12 proof tests the underlying
reader, not this HTTP route. Framework-generated HEAD/OPTIONS/405 behavior,
deployment header middleware and actual browser cache behavior are unobserved
here. No route flag was persistently enabled. All results remain synthetic,
executionAuthorized:false and not real-transcription quality evidence.

Same-model peer cross-review is not independent model-quality validation.

Subsequent controller full native receipt1789054544302 was read:19 clone receipts
exit0 with identical77-migration fingerprint, final exit0 and exact server STOPPED
15:38:38.305Z. The protected R1 transcript reader remains12/12 PASS in that run.
This adds underlying-reader regression proof, not direct HTTP/framework evidence.

## Subsequent real local HTTP OFF probe

Read the complete controller voice-review-http-smoke.mjs and its safeEnvironment
dependency, build receipt1789054876402 (exit0,15:43:01.611Z) and HTTP result/output
voice-review-http-1789055351796 (exit0,15:49:11.795Z). Seven real production-built
Next requests observed: three GET404 with exact opaque body and private/no-store;
HEAD404 empty with private/no-store; OPTIONS204 empty with GET,HEAD,OPTIONS Allow;
POST and DELETE405 empty. Framework method behavior OFF is now observed for this
build. Authenticated disclosure/browser cache/UI/device remain unobserved.

The child environment is allowlisted, checks absence of usable dotenv files,
and does not supply product flags or database/provider credentials. Only the
random local authentication secret is generated; safe output suppresses it.
Reviewer inspected names only and found .env.example, no actual dotenv config.
The probe binds loopback, uses bounded startup/HTTP/cleanup waits and stops only
its own child. No second probe was run by reviewer.

Cleanup evidence distinction reported to controller: child close event confirms
owned process44592 stopped (signal termination may have null numeric exitCode).
However the script sets portClosed=true for any failed post-stop fetch, including
a timeout. Thus this receipt proves the post-stop request failed, not a separate
TCP ECONNREFUSED assertion. Do not strengthen that observation into a socket or
process-tree proof. A future bounded direct TCP probe can tighten the label.

Controller corrected the oracle and reran separately; old receipt unmodified.
Read the new source delta and result voice-review-http-1789055508459: exit0,
15:51:48.458Z, same build ID, seven HTTP observations unchanged, owned child50824
close observed. New direct createConnection loopback probe only treats exact
ECONNREFUSED as portClosed:true; connect, two-second timeout and other errors
refuse that assertion. Receipt explicitly records TCP_ECONNREFUSED_REQUIRED.
This closes the specific port-observation gap without claiming general child-tree
isolation, authenticated disclosure or provider tests. Reviewer ran neither probe.
