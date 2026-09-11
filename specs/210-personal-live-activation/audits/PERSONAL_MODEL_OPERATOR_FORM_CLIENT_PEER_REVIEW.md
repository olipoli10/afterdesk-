# B4 owner form — bounded independent code review

Verdict: APPROVE LOCAL REVIEWED SLICE, 2026-09-11. No production enabling,
secret delivery or deployment authorization. Reviewer is a separate agent/test
author, not an independent model-family validation or external security audit.

## Scope and final source

Read complete component, wire, page, author tests, relevant B1/A producer rules
and Stage B/B4 plans. Engineering code-review skill supplies the security,
correctness, resource-bound and maintainability review dimensions.

- `src/app/personal/model/operator-setup/operator-form.tsx`:
  `026c6a0b0f02113d4de38c7013367ad0ca268ce5c39f613155f321e7176111c8`.
- `src/app/personal/model/operator-setup/operator-form-wire.ts`:
  `435b15cab2421ef9d493c18414dd87bbde35dbf1fbbb4796869775aab8ed600c`.
- New reviewer-owned `test/personal-model-operator-form-client-review.test.ts`:
  `3987d7c2ebc2183fdf9040bd3d4826a95921c6387ec65c18ba048429d45d9c3f`.

No author source/test, server selector, B1/B2, route, migration, deployment or
credential file was modified by this reviewer. Page checks were source review;
actual framework routing/cache/deployed instrumentation are controller gates.

## Reproduced defect and preserved RED

At 23:07:43 local runner time, reviewer suite: **8 PASS / 3 FAIL**.
The browser used the model-label grammar (max160) for `routeId` and `policyId`.
Real artifact -> complete manifest -> actual B1 claim/applied builders produced
legal IDs of161 and191 characters; B1 reinspection succeeded, browser parsing
refused. A third counter-test showed slash/space identifiers were accepted even
though Stage A's identifier grammar excludes them.

Author corrected only those two receipt fields to
`^[A-Za-z0-9_-]{1,191}$`; model/endpoint label limits remain160. All original11
reviewer oracles are preserved. This was wire compatibility/strictness, not a
demonstrated authorization bypass, provider call or deployed user incident.

The author separately reported11 React lint diagnostics for ref access during
render and refactored under controller approval. Reviewer did not reproduce that
initial lint run and does not claim its RED. Final full component was read: state
used for rendering is nonsecret; lifetime refs are created/read in effects and
handlers. Synchronous attempt latch still precedes the first fetch/await.

## Fresh verification

At **23:16:34**, author34 + reviewer14 = **48/48 PASS** under SafeEnvironment;
reviewer scoped ESLint subsequently exited0. No TSC/root/build/native execution.

Original11 include actual pure B1 producer parity at32/160/161/191 ID lengths,
invalid IDs, actual React server rendering without secret input or transport,
Buffer chunk mutation/copy, wrong setup, invalid UTF-8, empty-chunk bound and
redirect refusal. Three additional component-handler tests verify:

- StrictMode-style effect setup/cleanup/setup keeps one explicit POST and aborts
  pending work without reopening input;
- changed props hide input before the passive effect, and returning to the old
  props after revocation does not rearm;
- a persisted pageshow without an observed preceding pagehide still aborts the
  pending POST and closes input.

The three effect tests use explicit hook/DOM adapters, not a real browser renderer
or full React scheduler. The separate server-render test uses actual React SSR.
Producer fixtures are synthetic and pure: a B1 APPLIED descriptor does not itself
prove a database write/commit, consent authenticity or provider verification.

## Remaining limits / release gates

No further concrete defect found in one-submit latch, no secret React state or
persistence, BFCache handling, no optimistic success, bounded receipt reads, or
GET-only reconciliation after expiry. Historical recorded status is factual setup
metadata, not current activation authority; UI expiry checks are not server gates.

Browser strings/autofill/extensions/devtools are not a secure-erasure boundary.
No deployed request-body logging/replay/tracing exclusion, cookie/session path,
CDN/private cache or source/config target binding was verified here. B2/B3 reviews,
controller build/HTTP proof and those exclusions remain required before a real
key may be supplied. There were zero reviewer DB/provider/network/secret actions.

## Exact HTTP allowlist admission review

Controller reported root-1789096511158:7457PASS/1FAIL/3skip; the new browser form
was absent from `test/url-safety.test.ts`'s all-src named-file allowlist. This
historical root result is not replaced by a claim of a green root run here.

Read the complete architecture test and existing browser `endvera-mobile-api.ts`.
Approve one exact entry for this client component, with the fixed same-origin
setup protocol rationale. Retain engine zero-tolerance, the all-src scan,
comment-stripping and nonvacuity checks. Do not allow a directory, server ingress
or general transport. The existing mobile client has four unrelated typed
resources and unbounded response.json; widening it for this one-shot secret
protocol would not reuse its actual safety bounds.

Two additional reviewer tests call the real POST/GET handlers with URL-shaped
model/endpoint display labels. They assert the literal first-party path, only
configured UUID query for GET, same-origin credentials, no-store, redirect:error,
exact POST command and no GET body. The labels cannot select a destination.
**16/16 reviewer tests PASS23:20:02**; no author/allowlist edit or root rerun by
reviewer. This approves the narrow architecture exception, not secret delivery.
Final reviewer test SHA after these two additions:
`cb539ebe7a3c60c80f77857c4c22ca6013d2cb3cf6d8b6929d3a49c1b4df6bfd`;
scoped ESLint exited0. The earlier14-case hash remains historical above.
