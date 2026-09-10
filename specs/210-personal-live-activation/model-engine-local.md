# Personal model engine continuation

Same accepted spec210 goal; no new GO or external activation is implied.

## 2026-09-10 03:36Z — composed gateway; worker integration continues

The existing gateway now supports the distinct personal subject with an explicit
owner AI grant (not the SMS grant), one child model operation, one attempt, published
policy/exact privacy route, breaker, current reviewed rates/envelope and atomic USD
and CAD holds. No migration seeds an account, consent, policy, certificate or key.
The OFF-default dispatcher rechecks authority and both financial ledgers before and
after latency. One valid proposal remains NOT_AUTHORIZED, with billing UNSETTLED;
unknown/expired outcomes retain exposure and never trigger a retry.

Independent reviews found and fixed stale cap/day checks, postresponse budget
checks, invalid grant dates and schema transition/set preservation. Actual disposable
PG tests caught a removed legacy sms_pairing CHECK member before any deployment.
The integrated fake-transport PG suite passed33 tests before the final additional
post-latency cap withdrawal case. Final run evidence is linked in progress.md.

Root2986 PASS/3 historical skips; mobile219 PASS. Mobile pairing no longer depends
on an available outbox; exact uncertain draft retries retain their request identity
within the screen session. This is not installed-device or provider observation.

Next: source SMS lease/finalization fencing (late completion could overwrite an
uncertain source), exclusive model orchestration, deterministic review-only proposal
consumption and transaction-aware preparers, explicit owner AI configuration/consent.
Do not feed model proposals back into the legacy mutating interpreter. Existing
Twilio/key/Google/phone consent dependencies remain; no local test satisfies them.

## 2026-09-10 03:08Z — rolling implementation, not live completion

Read overnight-continuation.md for current rolling sequence. Subject relation and
immutable binding migration are implemented; real disposable PostgreSQL tests now
cover source reload, cross-workspace/refusal/revocation, one-attempt concurrent
claims, fenced completion, USD ledger rollback and competing holds.25 tests passed
with fake transports and disposable cleanup. Deployed DB remains unchanged.

OpenRouter adapter, prompt/schema, exact output cap, deep immutable request and
timeout uncertainty are local. Current-rate budget policy returns separately USD
and CAD micros plus rate fingerprint. New transaction-scoped account hold and
personal claim helpers do not yet compose a dispatch-authorized wrapper.

Critical cross-review fixed a legacy error path that could mislabel personal usage
as Anthropic/Task usage; current reinspection excludes the persisted personal subject.
Temporal grammar resolves exact quotes, anchored to persisted receipt time, and
clarifies ambiguous/DST/missing-end requests. Legacy inferred one-hour appointments
are no longer promoted automatically into Google write drafts; legacy local default
itself remains and is disclosed. No claim of general semantic model correctness.

Next: compose personal gateway policy/privacy/breaker admission, immutable child
model attempt with atomic USD+CAD holds and single dispatch fence, then worker
integration and exact action preparation. Operation remains UNREGISTERED until
that complete boundary is tested. No new paid call, live effect or deployment.

## Implemented and checked

`src/server/model-gateway/personal-intent/contract.ts` binds an untrusted proposal
to the exact canonical source-operation identifier and unmodified UTF-16 text.
Closed operations cover calendar reads, event preparation, SELF message/call
preparation, and fixed clarification reasons. Exact quotation offsets, input/JSON
limits, duplicate IDs, topological dependencies, and injected authority fields are
checked. No recipient addresses, workspace IDs, tool calls, generated absolute
times, success claims or approvals are accepted from the candidate.

This contract is intentionally NOT registered for gateway execution. It performs
no authenticated DB lookup, provider dispatch, cost reservation or authorized
preview. Even a valid proposal returns executionAuthorized:false and preview:null.
Quoted text is evidence of source bytes, not proof of correct semantic intent.
Ambiguous times and recipients still need deterministic resolution/clarification.

Red run root-1789007433586 retained: missing new module as expected, plus current
projection hash drift introduced by previous checkout EOL normalization. Rebuilt
the current projection from actual inputs; historical attestations unchanged.
Green run root-1789007595576: 2801 pass, 3 historical skips, including 16 new tests.
Root tsc --noEmit and focused ESLint exited0; provider boundary3350 modules/0 violations.
Wrong .mjs validator filename initially failed; correct package command passed.

## Remaining implementation sequence

1. Extend the EXISTING AiOperation/ModelGateway subject contract for a persisted
   personal inbound operation. Current bindGatewayOperation accepts only Task or
   VoiceIntakeSegment ownership. Add an explicit subject relation and CHECK rather
   than inventing a Task/client identity or weakening the existing subject checks.
   Reconcile ConstructionWorkspace owner/member to gateway tenancy explicitly.
2. Reload inbound source, verified phone identity, workspace membership, connector
   grants, expiry and policy inside authoritative admission. Never accept these
   facts or a permission snapshot from a model/request body. Recheck after latency.
3. Reserve current-authority OpenRouter cost atomically, preserving USD/CAD and
   total-pilot accounting distinctions. One durable attempt; timeout remains
   uncertain with hold retained, not an automatic retry. Reuse gateway breaker,
   policy, privacy and evidence primitives. Do not reuse R37 grants or receipts.
4. Build a disabled candidate adapter and typed operation through that gateway.
   Resolve quoted dates/targets deterministically; prepare immutable approvals.
   Unsupported recipient or ambiguous request becomes clarification, not a guess.
5. Integrate behind an OFF-by-default personal engine flag. Local fake-transport
   PostgreSQL tests must cover race/replay, revocation, cross-workspace access,
   quota concurrency, malformed output, uncertain outcomes, and no external effect.
6. Only then use currently authorized/provider-configured real transport. Current
   Twilio keys and owner Google consent still require genuine access. Fresh model
   pricing/privacy evidence and account limits are required; no historic budget.

Do not publish, redeploy or rebuild the APK for this unactivated contract alone.
Live personal-service acceptance and all historical dashboard metrics stay unchanged.
# 2026-09-10 04:19Z — composed pipeline and mobile review checkpoint

Current local implementation is recorded in progress.md and CONTINUATION_QUEUE.json:
full guarded gateway -> lazy one-use OpenRouter wire -> stored proposal -> exact
transactional review drafts + source completion -> owner-only mobile review.
Global transport kill switch and lane-specific flag are both required for actual
wire mode; current owner/source/AI grant/route/privacy/budget guards remain mandatory.
No real key, model call, deployment or Samsung observation was performed in this wave.

Evidence: root3142 before final kill-switch hardening; mobile255; disposablePG51,
cluster removed; Next build and Android export local PASS. Final root receipt will
be in progress.md. Full-source interpretation remains unverified until owner review.
Known-day Google read fast-path and native document picker recovery are next wave,
not a declaration that the entire personal service is ready. All dashboard metrics
remain unchanged, customer NO-GO and Verified-E2E0%.
