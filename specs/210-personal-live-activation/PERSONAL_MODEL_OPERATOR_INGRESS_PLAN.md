# Personal model operator ingress — Stage B design

## Controller admission — B3 HTTP, 2026-09-11 02:43Z

Controller reviewed B1/B2 source and the installed Next route-handler guide.
Admit local implementation of the exact owner-only GET/POST route below, with
the reviewed bounded HTTP reader. No server configuration, deployment, owner
consent, real key delivery or provider activation is admitted by this subsection.
Absent/malformed config refuses before auth; POST additionally checks current
window and exact fixed Origin. Capture original request context before any await;
recheck original configuration after auth/rate/body/ingress and serialization.
GET only accepts the configured setupRef and can reconcile expired history.
The existing generic personalApiUser helper is deliberately not widened/reused.
Error bodies stay fixed, no dependency exception fields are reflected; after
ingress dispatch every ambiguous result is UNKNOWN with automaticRetry:false.
Peer review plus isolated route tests precede any possible deployment.

Status: DESIGN FOR CONTROLLER REVIEW, 2026-09-11. This document authorizes no
route implementation, secret delivery, deployment, database write or provider
activation. It supplements `PERSONAL_MODEL_OPERATOR_SETUP_PLAN.md`; Stage A
remains independently reviewable without a production caller.

## 1. Decision and boundaries

Recommend one dedicated, disabled-default server ingress, running in the existing
personal backend and using its existing connector encryption key. The owner uses
the existing authenticated session; the controller separately installs one reviewed
server configuration. Both are necessary. A public setup reference is not an
operator credential, and controller configuration is not owner consent.

No local CLI needs the server encryption key. Never export, recopy, replace or
rotate that key. The new OpenRouter API key is delivered once to the server in an
HTTPS request body, held transiently and encrypted by Stage A. No key in Android,
query parameters, cookies, browser persistence, receipts, telemetry or Codex input.
No API key hash is emitted either. JavaScript strings cannot promise secure erasure.

The ingress makes no provider call, selects no new model, changes no inference
switch or runtime configuration, records no consent, and reserves no money. It
does not replenish the personal 20 CAD model envelope or substitute R37 authority.
Existing Google capability configuration is not overwritten.

The smallest durable custody seam is the existing `ConstructionAuditEvent` table,
with a dedicated personal setup namespace and deterministic uniqueness. Its rows
are **not DB-enforced immutable**: no append-only trigger exists, workspace deletion
cascades and actor deletion sets the actor FK null. This is an application-level
one-attempt record and nonsecret archive, not a backup or administrator-resistant
ledger. Published route/policy protection remains a separate existing DB invariant.

## 2. One server configuration, not a target factory

Proposed server-only setting: `ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION`.
Absent, malformed or expired means POST unavailable. Its closed v1 JSON contains:

- `version: personal-model-operator-ingress-configuration-v1`;
- `mode: ENABLED`, `setupRef` (canonical UUID v4, equal to manifest setupId);
- exact UTC `notBefore` / `expiresAt`, a maximum 15-minute invocation window;
- `manifestUtf8`: the exact original nonsecret manifest JSON text;
- `manifestSha256`, `expectedSourceHead`, `expectedSchemaCatalogSha256`;
- `controllerReceiptRef`: bounded nonsecret evidence identifier, not a path/URL;
- `targetProfile: PERSONAL_PILOT`, the only accepted profile.

No alternate target configuration or environment GO flag. The source-owned profile
pins the existing personal backend origin
`https://endvera-core-sandbox-afterdesk.vercel.app`, Vercel project
`prj_cEvjMH8iJ2C9khbZ0vsQlGKQ4Y75`, Neon project `withered-mud-08129552`, branch
`br-nameless-moon-ax8nmuwj`, endpoint `ep-purple-union-axj3h2t5`, database `neondb`
and role `neondb_owner`. Accept only the already reviewed direct/pooler hostname
forms of that endpoint and the existing required TLS configuration; do not print
the connection string. No client URL, Host header, file path or remote manifest
lookup chooses a target.

Snapshot and strictly parse the configuration before session/database work. Bind
manifest byte SHA and Stage A shape, manifest owner/workspace/setupId, authority,
source/schema pins and current window. Recheck the exact original configuration
bytes and relevant model gates at async boundaries. Model ENGINE and model
transport must remain OFF; the dedicated setup configuration is not an inference
activation flag. A changed configuration after a claim never permits a replacement
attempt or late success disclosure.

Keep the two manifest digests distinct: `manifestSha256` is the exact UTF-8 byte
digest pinned by the controller, whereas Stage A's `manifestHash` is its canonical
`sha256:`-prefixed structural digest. After checking the byte pin, derive the latter
with the real pure inspector and pass it as mandatory `context.expectedManifestHash`,
alongside the independently pinned head/schema and inspected artifact hash. The
request supplies none of these values. Store both digests with unambiguous names;
neither substitute JSONB serialization for original bytes nor omit Stage A's full
canonical manifest binding.

### Source and deployment evidence — no circular SHA or automatic attestation

Compute the configuration SHA externally over its exact UTF-8 bytes; do not put
that SHA inside the bytes being hashed. The controller receipt independently binds
configuration SHA, manifest SHA, reviewed source commit/archive digest, actual
deployment identifier, target metadata/schema capture and observed disabled model
gates. Install this runtime configuration after the reviewed source artifact is
fixed, so the manifest need not contain the hash of the commit containing itself.

The archive-based deployer does not guarantee `VERCEL_GIT_COMMIT_SHA`. Do not require
an invented value, derive a false attestation from it or label a caller/configuration
hash as a measured deployment identity. Runtime configuration equality provides
integrity relative to trusted operator configuration; the actual source-to-deployment
and Neon branch linkage are controller-verified receipt facts. DB name/role or URL
shape alone cannot prove that linkage. A receipt reference is not cryptographic
authentication of a receipt. Missing verified controller evidence blocks enabling
the configuration even if a synthetic parser accepts supplied fields.

The actual configuration delivery size limit and availability must be checked
before use. Do not silently truncate, split into arbitrary lookups, or switch to
a generic vault/configuration service if this single bounded setting cannot fit.

## 3. HTTP and owner contract

Proposed dedicated path, Node runtime, dynamic and uncached:

`POST /api/endvera/v1/personal/model/operator-setup`

The exact command is:

```json
{"version":"personal-model-setup-command-v1","setupRef":"<configured UUID>","apiKey":"<ephemeral OpenRouter key>"}
```

The command has no owner/workspace, artifact, model/rate/budget, credential ID,
source pin, deployment target, consent boolean, retry flag or arbitrary operation.
Use the existing API key grammar and maximum 512 characters. Strict JSON only,
no additional fields, no query string, no multipart/form encoding or redirects.

Require the existing verified CLIENT session from `getSessionUser`; derive the
actor server-side and require equality with the manifest owner. Stage A checks
current owner/workspace/membership and prior genuine model consent under its locks.
No PREPARE/CONSENT call is made on the owner's behalf. A platform admin, deployment
protection credential or API key alone is insufficient. The cached session helper
does not expose a fresh reauthentication timestamp: this design does not claim
fresh password/MFA verification or instantaneous session revocation.

For this secret-bearing browser ingress, require the exact fixed HTTPS Origin.
Reject absent Origin, `null`, `endvera://`, alternate domains and forwarded-host
substitutions. Do not widen the existing generic `personalApiUser` helper: its
absent/native Origin compatibility remains unchanged elsewhere. No CORS allowance.
Owner session compromise and trusted deployment-operator compromise remain threats;
neither is solved by hiding the route or using an unguessable setupRef.

A later minimal same-origin owner-only form may deliver the key using the ordinary
HttpOnly session cookie without exporting it. It must show the configured model
and purpose plus “credential prepared, not verified or activated”; submit only
after an explicit click, once, with no retry, analytics, error-body capture or
persistent draft. Clear its input after submission and never rehydrate the key.
No change to APK, mobile API, general admin console or consent flow. The form and
route remain remotely reachable surfaces, not a private vault. Its implementation
requires the separate controller mandate, including verification of deployment
logging/instrumentation exclusions for this request body.

## 4. Bounds, clocks and disclosure

- Command: maximum 4096 bytes and 4096 stream chunks, enforced while reading;
  Content-Length is an early check only. Copy each chunk, use fatal UTF-8 decoding,
  and refuse non-JSON content types and extra fields. Race only body reading with
  the original abort/deadline, cancel best-effort without awaiting a hung cancel.
- Manifest: maximum 256 KiB UTF-8 before parse, Stage A's closed bounded structure.
  Retain the original UTF-8 string so a JSONB reserialization cannot change what
  the recorded **byte hash** refers to. No Unicode/newline normalization.
- Configuration and each complete stored metadata JSON: maximum 512 KiB of the
  actual serialized UTF-8 value, not a sum of selected fields. Escaping overhead
  counts. Bound strings, arrays, keys and depth before materializing unrestricted
  structures; reject non-JSON/proxy/accessor inputs in pure helpers. No truncation.
- Client receipt: maximum 16 KiB, closed schema and false authority flags. Archive
  and receipt validation failures refuse; no fallback to reduced metadata.
- One original 15-second wall/monotonic budget starts at route entry and includes
  authentication, rate limit, claim commit, core wait and commit, and serialization.
  Core transaction at most 10 seconds and no more than remaining budget; claim
  transaction at most 3 seconds and remaining budget. MaxWait/statement/lock bounds
  consume the same budget. Never restart a fresh 15 seconds after the claim.
- Reject clock nonfinite/backward observations, abort and expired configuration at
  each continuation and before/after response serialization. DB clock also governs
  pilot, review freshness and invocation window; do not assume wall and DB epochs
  agree. Carry a conservative monotonic TTL derived from the DB observation to
  publication, rather than trusting device/server wall alone for late disclosure.

Use the reviewed correlated-calendar POST's bounded read/original-context pattern,
not the older `model-http.ts` reader unchanged. Auth/Prisma promises are not forcibly
cancelled by racing an HTTP timeout; late continuation must not begin another
phase or publish success. Check the copied original signal and configuration,
not mutable replacements. Release owned listeners/timers in all outcomes.

All responses use `private, no-store`, `Vary: Cookie, Authorization`; no raw
exception, key, key hash, ciphertext, environment dump or connection URL. Before
a claim: fixed 404 disabled/foreign scope, 401 no session, 400/413/415 malformed,
429 rate limit, 503 refused if unavailable. After claim dispatch or a possible
core commit: fixed `UNKNOWN`, `automaticRetry:false` on ambiguity/late disclosure.
Do not disclose success after owner access or original context is lost, and do not
rewrite the committed database fact to match the opaque HTTP response.

## 5. Durable claim and sidecar — existing table, exact namespace

Use `entityType = personal_model_operator_setup`, `entityId = setupId`, exact
workspace and actor bindings. Do not use `entityType = action`, so current action
audit projections are not reused. Existing `appendConstructionAudit` includes a
random nonce in its fingerprint and is not the deterministic one-attempt helper;
leave it unchanged and implement a small setup-specific insert helper later.

For event kind `claim` or `applied`:

- deterministic primary key: `personal-model-setup:v1:<setupId>:<kind>`;
- action respectively `personal_model_setup_claimed_v1` or
  `personal_model_setup_applied_v1`;
- fingerprint: existing canonical SHA-256 over a closed descriptor containing
  namespace/version, event kind, setupId, workspaceId, ownerUserId, manifest byte
  SHA, artifact hash, configuration SHA, source/schema pins and target profile.
  No random value or secret contributes. Actual DB timestamps are metadata, not
  inputs that could change replay identity.

The claim metadata archives the **complete** original `manifestUtf8`, its byte SHA,
artifact hash, configuration SHA, source/schema/target pins, controller receipt
reference and DB claim time. The original nonsecret manifest includes all review
hashes and complete route/policy drafts; a reduced DB projection is insufficient.
Apply all outer and nested/global storage bounds before insertion and on readback.
Do not put credential material or raw requests in the archive.

The deterministic PK blocks a changed fingerprint under the same setupId. A
same-fingerprint conflict is also **not** permission to proceed. SetupId is the
one server-configured identity, never a request UUID chosen afresh. This design
must not offer another attempt merely by updating setupRef/configuration. A future
new setup requires a separate controller decision and state reconciliation; no
automatic recovery/rotation path exists here.

### Transaction sequence and uncertainty

```text
strict server configuration + owner command
  -> TX1: current owner/consent precheck + insert/read back complete claim
  -> known TX1 commit, only this successful inserter continues
  -> TX2: recheck exact claim + Stage A core + exact applied event/readback
  -> known TX2 commit + current disclosure checks -> closed receipt
Any ambiguity -> stop; subsequent requests can only reconcile read-only
```

TX1 is a short SERIALIZABLE transaction with current owner and genuine consent
checks, configuration/DB window checks, deterministic insert and complete readback.
Only the invocation that inserted the new row and received its known commit
acknowledgement may call the core. Keep that permission private to the orchestrator
control flow, not an exported `{claimed:true}` argument accepted from an HTTP body.
Concurrent losers never run the core. Lost claim acknowledgement never runs the
core, even if a later read finds the matching claim. A crash between transactions
consumes the attempt: safe unavailability is preferable to an automatic second try.

TX2 reads and locks the exact claim, validates the complete sidecar against the
trusted configuration, and invokes Stage A with the original context. Stage A
again checks current owner/consent/initial-only constraints and all mappings.
Insert/read back the deterministic applied event in **the same transaction** as
route/policy/initial credential publication and account update. Its closed metadata
contains the receipt and claim fingerprint, no key or new secret hash. Failure to
write/validate this event rolls back TX2; no separate best-effort success receipt
after business commit. There is no transaction retry or nested root-client call.

Claim-only state means “attempt started, completion not established”, not proven
rollback. The durable claim is the uncertainty record if deadline/connection loss
prevents another write; no mandatory out-of-budget error TX is invented. This
refines Stage A's redacted uncertainty-receipt requirement without claiming every
late failure can be persisted. A known applied event and exact matching business
rows take precedence over a lost HTTP acknowledgement. Never delete the claim,
release/replenish budget, overwrite the winner or retry with a new setupId.

Application code only inserts these events. Reads still validate exact identity,
fingerprints, archive bytes and all persisted mappings; a mutable audit record is
not sufficient proof by itself. DB administrator tampering, cascade deletion and
backup/recovery remain outside this one-attempt guarantee and must not be advertised
as solved by a hash stored beside the data it hashes.

## 6. Read-only reconciliation, not a receipt capability

`GET /api/endvera/v1/personal/model/operator-setup?setupRef=<configured UUID>` is
the proposed bounded sibling. It accepts no key or arbitrary owner/workspace and
requires the current verified owner. No secret is decrypted and no write/retry is
performed. It must remain usable for that fixed reference after the POST window
closes while the trusted configuration is retained; `mode: ENABLED` and the short
window are POST admission gates, not proof that history disappears after expiry.
Removing configuration may make history unavailable, never empty-success.

Read the exact claim/archive, applied event and Stage A reconciliation in a bounded
read-only transaction. Rebuild historical artifacts at their recorded publishedAt,
not with today's review freshness, then compare every persisted mapped field and
credential/account identity. Historical equality cannot make revoked credentials
active, grant fresh consent, reserve budget or authorize inference. Owner revocation
refuses disclosure. Missing/partial/conflicting rows yield UNKNOWN or INCONSISTENT,
never “rolled back, try again”. Do not infer transaction finality from a temporary
absence during an in-flight writer.

Known success uses the Stage A receipt fields and fixed false flags:
`executionAuthorized`, `providerVerified`, `consentCreated`, `runtimeActivated`,
`billingSettled`. Include `automaticRetry:false`. No receipt key, bearer token,
credential material or artifact body is returned. SetupRef is a lookup selector,
not a receipt capability. The UI can say “Configuration enregistrée; modèle non
activé” only on exact known committed state; otherwise “Résultat non confirmé;
aucun nouvel essai automatique.”

## 7. Minimal future files and proof gates

After approval, proposed additions only:

1. `src/server/model-gateway/personal-intent/operator-ingress.ts`: server-only
   closed configuration, target checks, claim/core orchestration and reconciliation.
   Small pure contract helper if required to keep tests/imports free of Prisma.
2. `src/app/api/endvera/v1/personal/model/operator-setup/route.ts`: dedicated POST
   and GET with existing session authority, strict Origin and original deadline.
3. One narrowly scoped owner-only same-origin form, exact path chosen during UI
   review; no general admin shell or mobile key feature. Defer it until server
   proof rather than publishing a button with a nonfunctional secret destination.
4. Focused tests and a controller-owned extension of the existing native fixture.
   No migration, new table, package, worker, queue or new deployment platform.

Required falsifiable gates, not just happy-path counts:

- Config missing/expired/changed, wrong target/source/manifest bindings, extra keys,
  over-limit escaped archive and proxy/getter inputs refuse before claim. Supplied
  hashes never produce an authenticated deployment claim.
- No owner/admin-only/foreign owner/no genuine consent; absent/native/hostile Origin;
  query/body smuggling, hung/changing stream, chunk/byte limits, secret sentinels in
  all error/receipt/audit paths. No provider calls or activation writes.
- Two concurrent requests: one claim and at most one core; same setupId/different
  manifest, same fingerprint, changed setupRef and replay never make another core
  call. Claim commit acknowledgement loss and crash-before-core remain spent.
- Failure at each TX2 publication/account/applied-event write rolls all TX2 state
  back but preserves TX1. Applied commit acknowledgement loss reconciles without
  key or another write. Owner/consent/config drift and original wall/mono expiry
  across auth, locks, commits and serialization cannot publish late success.
- Real native synthetic transactions verify PK/fingerprint contention, full archive
  roundtrip, actual exact column readback, historical publishedAt reconstruction,
  visibility during locks and independent commit-loss cases. Mocked transaction
  callbacks alone are not native atomicity evidence or human consent proof.
- Actual controller receipt, after implementation review, pins source deployment,
  configuration bytes/target/schema and OFF state. Verify no request-body logging
  and the authenticated owner delivery path before any real key is supplied.

Stop before production enablement if Stage A proof is incomplete, genuine owner
consent/reviews are missing, controller source/target receipt cannot be established,
configuration does not fit, secret delivery/logging exclusion is not verified, or
any previous attempt is uncertain. No placeholder reviews or simulated consent.

## 8. Evidence and trade-off

Design grounded in the current Stage A plan, model connection/consent code,
`personalApiUser`, correlated-calendar POST, auth session helper, Prisma audit
schema and existing audit helper; relevant installed Next authentication,
environment-variable and Route Handler guides were read. The system-design skill
was used to keep this to the existing session, transaction and storage boundaries.

The deliberate cost is that a crash after the durable claim can require manual
reconciliation rather than recover automatically. That is acceptable for one
initial personal setup; reusable administration, credential rotation and a broader
authorization service are explicitly not built. Revisit only under a separately
approved multi-operator/repeated-setup requirement, not to rescue this one attempt.

This task wrote only this plan. No route, runtime setting, secret, database,
provider, deployment, test execution or percentage/readiness claim was produced.

## B1 — approved local pure-contract slice (2026-09-11)

Controller approval is limited to new `operator-ingress-contract.ts` and its
dedicated tests. The system-design skill is used to separate supplied integrity
from invocation authority: exact configuration text → Stage A pure manifest
inspection → deterministic claim/applied descriptors → strict archive readback.
No HTTP, database, environment access, secret delivery or orchestration is added.

The single configuration is deliberately limited to **16 KiB UTF-8**, including
escaped manifest text; the manifest retains its separate 256 KiB ceiling and each
complete archive its 512 KiB ceiling. These are parser limits, not proof that a
real deployment can deliver the setting. Reject proxies before reflection and
accessors before reads; pre-bound depth, arrays, strings and running JSON bytes.
Keep original byte SHA distinct from Stage A canonical manifest hash. Reuse the
existing pure construction audit canonical fingerprint producer, with a closed
fixed descriptor and timestamp-independent event identity.

Configuration parsing does not expire history. A separate pure window check uses
an explicitly supplied clock for initial admission (at most 15 minutes, half-open
window); it does not read ambient clocks. Archive inspection reconstructs the
expected descriptor from the trusted supplied configuration, verifies all fields
and complete original manifest bytes, and refuses missing/extra/changed metadata.
Pure builders cannot prove a claim insert, commit, operator review authenticity,
actual deployment, current owner/consent or provider behavior. Those remain later
orchestration/controller gates. No secret-bearing command parser is part of B1.

B1 implementation checkpoint: 65/65 author tests passed at 22:38:36 local runner
time, using the real synthetic artifact/manifest producers. Scoped ESLint and the
shared root TypeScript check (session 67773) exited 0. Initial lint rejected a test
variable named `module`; initial TypeScript found a literal-inferred size parameter
and B2's hostname union typing. These were corrected without changing limits or
oracles. No B1 test executed HTTP, SQL, secret lookup, provider transport or current
deployment verification. Historical parsing remains supplied-data integrity only;
known commit, current ownership and actual publication timestamps belong to B2.

## B2 — approved local orchestrator slice (implementation note before code)

Owned files: `operator-ingress.ts` and `test/personal-model-operator-ingress.test.ts`.
No HTTP route, form, configuration installation, production invocation or provider
call. The system-design skill is used to retain the two existing-DB-transaction
boundaries rather than introduce another authorization platform.

The server orchestrator consumes the fixed configuration text through the real
B1 parser; no alternate manifest/target factory. Its actor argument represents an
already verified server session (CLIENT, emailVerified, userId), then both the
claim transaction and Stage A check current DB owner/consent. URL parsing only
verifies the server environment's fixed endpoint/role/database/TLS shape; supplied
source/receipt pins are not runtime deployment or Neon-branch attestation.

TX1 (SERIALIZABLE, max3s within entry15s) locks owner/workspace/member/grant, checks
current DB window and inserts the deterministic B1 claim plus complete archive.
An existing claim is not adopted. Insert/readback success is only provisional;
only the private continuation after known TX1 commit starts TX2. Any dispatched
transaction rejection is conservatively UNKNOWN, not assumed rollback. No retry.

TX2 (SERIALIZABLE, max10s within the same entry15s) locks/validates the exact claim,
calls unchanged Stage A with original deadlines, inserts the B1 applied event,
and validates readback in the same transaction. Known commit is followed by live
context and conservative DB-derived monotonic expiry checks. No listener or timer
may continue a detached second phase after cancellation. The caller remains
responsible for HTTP serialization/disclosure guards before a future route exists.

Read-only reconciliation uses retained configuration even after its window closes;
it needs no new key, does not decrypt a credential, never retries TX2, and combines
exact B1 claim/applied archive checks with actual Stage A historical reconciliation.
Claim-only/missing/ambiguous state is not evidence of rollback. Application audit
rows are mutable by DB administrators; no backup/global immutable ledger claim.

Tests use explicit mock transaction/DB boundaries, with the real B1 contract where
available, and distinguish lost claim acknowledgement (zero core calls), lost core
acknowledgement (no retry), malformed readback, abort/deadline/config changes and
expired-window historical reads. Controller owns subsequent native proof.

### B2 local implementation evidence and exact seams

`applyPersonalModelOperatorIngress({actor:{userId,role,emailVerified},setupRef,apiKey},env,context)`
and `readPersonalModelOperatorIngress({actor,setupRef},env,context)` return the exact
B1 receipt only after a known transaction resolution. Context carries the original
wall/monotonic deadlines and original AbortSignal. Server session validity is a
caller prerequisite; the role/email/identity fields are not a caller-created
capability, and current DB owner/consent checks remain mandatory.

`assertPersonalModelOperatorIngressPublication(receipt)` uses a private WeakMap
registered only after known commit. Future HTTP code must call it before and
after serialization. Copied/unregistered receipts refuse. It rechecks the original
configuration/target/gates/cancellation/clock budget, not a new owner DB inspection
after locks have been released. Current owner locks protect transaction-time
disclosure checks; a later revocation is not instantaneously observable forever.
Historical receipt false flags describe what setup did, not a promise that a
separate later controller never activated the runtime.

TX1 maxWait+timeout together are capped at3s; TX2 together at10s, each also within
the same entry15s remaining budget. No promise race starts a detached next phase.
The DB-derived monotonic expiry uses the query-start anchor and the minimum of
configuration window, pilot, privacy and review freshness bounds, with the actual
artifact validator at each DB-clock observation. No app/DB epoch equality is used.

Readback maps the actual ten Prisma audit columns explicitly to the closed B1
insert descriptor (createdAt validated but not confused with claimedAt). Claims
and applied rows use the existing namespace/PK/unique fingerprint. Historical
read additionally binds the receipt's publishedAt to the actual route timestamp;
missing or conflicting records are UNKNOWN, not a new attempt. No ledger is read
or written and no source/SMS/customer payload is archived.

Initial baseline22:29:16: missing new module, failed suite/zero tests (not a product
vulnerability RED). First full run22:36:13 had36PASS/1FAIL: the TTL test fixture left
only1ms, correctly rejected by the minimum3ms transaction budget before TX2. The
fixture now leaves1000ms, explicitly asserts two commits, passes at999ms and
refuses at1000ms; no guard was weakened. Subsequent102/102 then104/104 PASS22:37:55
combine65 B1 and39 B2 tests. Concurrency is simulated and Stage A effects are
mocked in B2 tests; actual A/native tests are distinct. Scoped lint passed. A
TypeScript hostname literal-union error was corrected with exact comparisons.
No actual setup/DB/network/provider/configuration/deployment execution occurred.
