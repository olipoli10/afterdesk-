# Personal model operator form — B4 bounded design

## Local verification completed — 2026-09-11 03:34Z

Implementation, peer correction/review and controller verification are complete
locally. See audits/PERSONAL_MODEL_OPERATOR_FORM_CONTROLLER.md: root7463 PASS/
3 historical skips, build PASS, actual built OFF HTML/HEAD/Flight3 and API7 PASS,
native B2+B4 24 PASS with exact disposable server stopped. Earlier REDs are retained.
No real configuration/key/consent/inference/deployment or whole-product completion.
The admissions and intermediate pending statements below are historical records.

## Current controller admission — full local B4, 2026-09-11 03:13Z

The initial selector-only admission below is historical. B1/B2/B3 are now locally
reviewed and committed at 0f63e52c06ebe7d048d8579a9d710b16010a40c1. The controller
admits the planned selector, minimal RSC page, browser wire/component and exact
page headers for local implementation and validation. This does not admit real
key submission, configuration installation, deployment or provider activation.
Deployment logging, genuine consent and authentic provider reviews remain gates.

Selector author51 + peer5 pass. Browser peer initially recorded8 PASS/3 RED:
route/policy identifiers valid up to191 characters were rejected by a160 limit,
while slash/space identifiers were accepted. The narrow identifier schema fix
passes author34 + peer11. Scoped lint then found11 React ref-during-render errors;
the controller admits a bounded visual-state refactor without disabling that rule,
storing secrets in state, weakening the synchronous attempt latch or changing API.
Peer rereview, combined tests, types, build and actual OFF HTML/Flight remain due.

## Controller admission — selector only, 2026-09-11

Admit local implementation of `operator-form.ts` and its dedicated selector unit
tests only. No page/client, B1/B2 change, deployment or enabling. The no-argument
server-only selector reads session and configured scope, returns only the closed
public view below and never reads archive metadata, credential ciphertext/API key
or connector encryption key. Fixed database URL shape is checked transiently in
memory exactly as B2; no URL/password is emitted. Original 5s budget begins before
auth. History does not require renewed consent, key or freshness. Initial input
requires current genuine consent, no prior credential and both model gates OFF.

Status: DESIGN FOR CONTROLLER REVIEW, 2026-09-11. No form implementation,
configuration installation, secret delivery, deployment or provider activation.
Depends on accepted B2/B3 review and controller verification of secret-body logging
exclusions. This is one initial owner setup, not an administration product.

## 1. Smallest useful surface

Use `/personal/model/operator-setup` on the fixed personal HTTPS origin. Reuse the
existing B3 GET/POST `/api/endvera/v1/personal/model/operator-setup` unchanged.
Do not add Server Actions, mobile methods, public navigation, account creation,
model selectors, consent controls, a second endpoint or a generic credential API.

Proposed implementation ownership, after approval:

- `src/app/personal/model/operator-setup/page.tsx`: request-time RSC page, noindex,
  minimal existing visual primitives and one client island. No AppShell dependency.
- `src/app/personal/model/operator-setup/operator-form.tsx`: small client component,
  one secret submit plus an explicit read-only result button.
- `src/server/model-gateway/personal-intent/operator-form.ts`: `server-only`
  read-only selector `readPersonalModelOperatorFormView()`; no caller-chosen actor,
  workspace, setupRef, target, environment or artifact in its public page seam.
- Dedicated selector/component tests. A tiny browser-safe wire validator may be
  co-located with the client component; do not import B1's Node/Stage A graph into
  the browser merely to validate the receipt.
- Narrow page-only no-store/referrer headers in existing `next.config.ts`, if
  actual framework responses need them. No broad header/auth/proxy rewrite.

The root layout has local fonts and no analytics import in the inspected file.
The `/client` layout also reads notifications and standing-capacity state; avoiding
it removes unrelated reads/navigation, not an alleged telemetry vulnerability.
Existing `src/proxy.ts` still applies its preview API/write refusal unchanged.

## 2. Selector: metadata only, never initialize from RSC

Parse the one existing bounded server configuration through B1 before auth/DB.
Absent/malformed config yields generic unavailable, with no configured metadata.
Use existing `getSessionUser` and the same verified CLIENT/exact configured-owner
rule as B3, then check current active workspace, owner membership and user in DB.
Authentication is checked near these reads, not only in a layout. An unauthenticated
page can redirect to the existing login with this fixed safe return path; foreign
users/admins receive no setup information. No new sign-in mechanism.

Use an original bounded 5s wall/monotonic read budget including session wait,
transaction maxWait, SQL and final checks; reject nonfinite/backward clocks and
configuration-byte changes. Read only the exact configured setup's claim/applied
**IDs**, and current consent/account eligibility metadata when offering initial
input. No audit metadata/archive, credential ciphertext, API key or connector
encryption key needs to be selected. Follow existing owner/grant lock ordering if
locks are needed; no namespace/global schema change. This selector's observation
does not authorize POST and cannot guarantee no later concurrent claim/revocation.

Return a closed, small public DTO (explicit mapping, never spread config/Prisma):

`version: personal-model-operator-form-v1`, `setupRef`, fixed `provider: openrouter`,
configured model and provider-endpoint labels, fixed purpose
`personal_intent_candidate_v1`, configured expiry, and state
`INPUT_AVAILABLE | HISTORY_ONLY`, with `executionAuthorized:false` and
`providerVerified:false`. No owner email/IDs, source/receipt references, full
manifest, archive, reviews, raw rates or environment values in HTML/Flight/props.
Derive labels from the inspected real artifact, not invented model/rate defaults.

Offer INPUT_AVAILABLE only with current window, existing genuine consent,
initial-only account eligibility and neither deterministic claim nor applied ID.
Any existing attempt, expired window, or absent current consent suppresses the
key input; owned history can still be offered. Malformed/inconsistent lookups
fail closed rather than turn into availability. Any attempt ID blocks input even
if malformed; B3 GET performs complete archive validation, not the selector.
Do not interpret GET UNKNOWN/missing claim as permission to show another attempt.

The RSC MUST NOT call PREPARE, CONSENT, APPLY, the publisher, a credential loader,
or a claim builder/insert. It does not initialize the workspace or archive and
does not return archive bytes to React. Rendering/prefetching causes no setup
mutation. History comes through explicit B3 GET, not a full RSC archive preload.

## 3. One key, one explicit submission

Show configured provider/model/endpoint and purpose as escaped text, with:
“Enregistrer la clé pour cette configuration. Aucun modèle n'est activé et aucun
appel fournisseur n'est effectué.” Show a missing-consent/unavailable notice,
not a checkbox that fabricates consent. Client cannot choose account, model,
prices, budget, credential ID, setup reference, workspace or destination URL.

Use an uncontrolled password input, max512, no default value, spellcheck off and
autocomplete discouraged. No key in React state, URL, hidden fields, cookie,
local/session storage, logs, telemetry, error text, persisted drafts or clipboard
API. Browser autofill/extensions/devtools and garbage collection cannot be claimed
securely erased or controlled by these attributes.

Before the first await, synchronously latch the attempt, validate the existing
key grammar locally, capture one bounded command body, clear the input and remove
the editable secret field. Invalid local input can be corrected before dispatch;
once dispatch begins, every outcome permanently closes this mounted form's POST
path. Do not infer that 4xx or a transport error permits a repeat. No implicit
form navigation, Server Action queue, useEffect POST, autosave or retry wrapper.

Send exactly `{version:personal-model-setup-command-v1,setupRef,apiKey}` once to
the fixed same-origin B3 path with JSON, `credentials:same-origin`, `cache:no-store`,
`redirect:error` and one AbortController. Do not set/log/read the session cookie
or forge Origin. Drop transient references after fetch dispatch/settlement where
possible; this reduces retention but is not secure string erasure. Hide/clear on
pagehide, revoke the UI on BFCache restoration, and abort owned pending work on
unmount. Aborting HTTP does not prove rollback or cancel a committed server fact.

On reload, the selector's durable-claim observation suppresses a replacement
key. Another open tab can be stale: the B2 deterministic claim is the actual
one-attempt enforcement, not browser state or missing-ID observation.

## 4. Result and expiry

No optimistic success. Validate bounded response JSON, exact closed receipt keys,
scalar types, fixed false flags and setupRef before presenting its known result.
Keep browser shape validation distinct from B1 archive integrity/DB commit proof;
those are server responsibilities. Never display raw response/error objects.

Known receipt: “Configuration enregistrée; modèle non activé lors de cette
opération.” UNKNOWN/network/abort/malformed response: “Résultat non confirmé.
Ne soumettez pas une nouvelle clé; consultez le résultat.” Historical false flags
describe this setup, not a promise about a later separate activation.

Provide an explicit “Consulter le résultat” button issuing one B3 GET for the
fixed setupRef, no key. Serialize GETs; no polling, interval, focus retry or POST
fallback. Respect B3 rate limiting. It remains usable after config expiry while
the retained configuration and current owner authorization permit history. An
expired page shows no key input. Expiry/clock checks in the browser are only UI
hints; B2/B3 remain authoritative and do not accept the device's time.

## 5. Proof and deployment gates

Required local tests before review: off/foreign/admin/unverified owner, no genuine
consent, expired-history availability, existing or malformed attempt, no selector
writes/decrypt/provider effects; no manifest/archive sent in RSC props/HTML/Flight;
double click and Enter produce one POST; every error/abort closes POST; key input
clears and never returns after rerender/BFCache; exact URL/body and no redirects;
GET after expiry sends no key; malformed/wrong-setup receipt never displays success.
Use synthetic key sentinels only, including console/storage/analytics spies.

Controller then verifies actual built page/RSC and B3 responses are private,
no-store, unindexed, same-origin and unframeable. Dynamic rendering alone is not
proof of browser/CDN no-store. Existing global CSP allows only self connections
and blocks framing, but includes inline scripts; do not call it a complete XSS
or secret-custody guarantee. No secret-bearing native form fallback without JS.

Before enabling this page for a real key: review B2/B3 and final built dependency
graph; explicitly exclude request bodies, input values and exception payloads
from deployment logs, tracing, analytics/session replay and proxy capture for
this exact page/API. Inspected root/AppShell/proxy files contain no body logger,
but that does not verify Vercel instrumentation, browser extensions or deployed
middleware. Missing exclusion evidence is a stop, not permission to test a key.
Source/config/target binding, genuine owner consent and reviewed model/rate/privacy
evidence remain separate controller gates. No new connector key or provider call.

Grounding: complete Stage B plan/B3 route, existing root/client layouts, authz,
AppShell, proxy and Next config; installed Next server/client-components, forms
and authentication guides read. The system-design skill keeps the selector and
client boundary small and separate from the existing authority/transaction path.
This document implements nothing and supplies no production readiness claim.

## B4 selector implementation checkpoint — local only

The preceding design-only statement described the initial document. Under the
explicit selector admission, `operator-form.ts` now implements the no-argument
server-only seam and the exact `UNAVAILABLE | AUTHENTICATION_REQUIRED | AVAILABLE`
union. Configuration and database-target pins are checked before session work;
only INPUT_AVAILABLE requires the current model gates/authority/consent/initial
credential conditions. Owned HISTORY_ONLY does not require a key or unexpired
configuration. No API/archive metadata or ciphertext is queried. It takes owner,
grant, then account SHARE locks and never acquires a namespace afterward.

The 5s wall/monotonic budget begins before auth; transaction maxWait and timeout
consume the remainder. Final DB clock plus query-start monotonic anchor suppresses
input if expiry is crossed during commit, including differing app/DB epochs.
This is a UI observation after a known read transaction, not ongoing authority
or a proof that a later page render cannot be stale. B2/B3 still decide every POST.

First author run: 51/51 PASS at 23:01:00 local runner time; scoped ESLint exit0.
No failing product oracle preceded this initial implementation, and no RED is
claimed. Tests use real B1/artifact parsing with mocked session/SQL/commit and
synthetic configuration only. They cover closed DTO/IDs-only queries, owner and
consent predicates, credential history, both model gates, URL policy, late context
mutation/clock faults, auth budget consumption and DB expiry across commit.
No TSC, full-root, native DB, page/client build, configuration installation,
secret retrieval, network, provider call, deployment or commit was performed.
