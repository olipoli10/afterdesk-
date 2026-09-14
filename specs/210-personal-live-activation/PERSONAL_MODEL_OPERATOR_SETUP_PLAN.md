# Personal model operator setup — bounded implementation plan

Status: REVISED DESIGN FOR CONTROLLER REVIEW, 2026-09-11. No implementation or external
execution authorized by this document. Same personal-pilot queue; no new goal,
budget, provider authority, model selection or privacy certification.

## 1. Decision and scope

**Stage A: locally testable pure validation and transaction core. Stage B:
BLOCKED_ON_TRANSPORT_DESIGN.** The controller verified that the existing connector
encryption key was generated directly into Vercel Production sensitive storage
and is not available locally. The previous CLI APPLY proposal incorrectly assumed
that it could be supplied in a private frame. That proposal is withdrawn, not
silently treated as executable. Do not reveal, recopy, regenerate or rotate that
key, and do not weaken sensitive-secret handling.

Stage A validates the reviewed artifact and implements atomic publication plus
initial encrypted credential storage using existing tables. It has no production
caller. Production invocation must eventually run where the existing server
environment is available, or use an actually verified authorized vault mechanism.
No such vault/invocation mechanism is currently demonstrated. It does not record
consent, activate switches, reserve/spend money, call OpenRouter or prove a key.

Operator DB access is not substituted for real owner consent. A platform admin
alone is insufficient. No mobile key field, unauthenticated endpoint, general
admin console, arbitrary SQL/function runner or build-time database write.

Read for this plan: engineering system-design skill; current model connection,
consent route/mobile card, operator preparation/configuration/admission, fixed
OpenRouter transport, Prisma models and published-history triggers. The earlier
native credential/migration bridge was inspected for its private-frame pattern,
not adopted as an arbitrary-purpose secret or database executor.

## 2. Existing seams and the actual missing code

- `src/server/personal-assistant/model-connection.ts` already implements owner
  verification, `provisionPersonalModelCredential`, AES-GCM bindings, status,
  consent and disconnect. The provision helper owns its transaction and can
  rotate credentials. Calling it from an outer transaction would **not** make
  publication atomic; do not do that.
- `src/server/model-gateway/personal-intent/operator-preparation.ts` prepares and
  rebuilds exact artifacts, but only returns draft route/policy descriptors.
  There is **no existing production route/policy publisher** in the searched
  src/scripts/deployment paths. Tests insert synthetic rows; they are not a
  production setup interface.
- Existing `ModelGatewayRouteProfile` and `ModelGatewayPolicyVersion` have unique
  IDs, canonical hashes and `(key,version)` constraints. Published/retired history
  is immutable. No migration is proposed.
- Existing authenticated `POST /api/endvera/v1/personal/model/consent`, PREPARE
  and explicit CONSENT `personal-model-consent-v1`, stays unchanged. The mobile
  `personal-model-connection.tsx` switch explains disclosure to OpenRouter and
  separately records the owner choice. No key, rate or model is accepted there.

### Stage A owned files (local implementation approved by controller)

1. `src/server/personal-assistant/model-connection.ts`: extract the existing
   provisioning body into a transaction-client helper; retain the public wrapper
   and its previous behavior/tests. Proposed internal seam:
   `provisionInitialPersonalModelCredentialInTransaction(tx, input, env, context)`.
   This export is strict initial-only itself, never an options bag that permits
   rotation. The legacy wrapper retains random IDs and legacy rotation through
   a private shared credential writer. Shared encryption/owner checks must not
   be relaxed. Reject root clients and verify SERIALIZABLE at runtime.
2. New `src/server/model-gateway/personal-intent/operator-setup.ts`: closed setup
   manifest validation, explicit DB-column mapping and one setup transaction;
   no transport import. Export `applyPersonalModelOperatorSetupInTransaction`
   accepting the caller's bounded SERIALIZABLE transaction, validated manifest,
   existing server environment and ephemeral API key. No root-client default,
   nested transaction, HTTP route, executable CLI or automatic invocation.
3. In the same new operator-setup.ts module, export
   `inspectPersonalModelSetupManifest`, closed pure shape/mapping validation;
   no eager imports that initialize Prisma. If full artifact validation currently
   traverses admission/evidence into DB, defer that import in the transaction
   module, not in the pure DRY_RUN graph. No broad refactor of the old gateway.
4. Dedicated pure/transaction tests and one controller-owned native test addition using
   a new owner/account with real preparation/consent functions under synthetic inputs
   (not the old fixture that already publishes rows). No Android/queue/route changes.

## 3. Closed non-secret inputs and dry run

Stage A accepts a bounded supplied non-secret JSON data object and an independently
pinned expected canonical full-manifest SHA. It does not choose files or access a repository.
A later ingress must obtain the reviewed manifest from a fixed trusted source,
not accept arbitrary client artifact publication. A later transport must bound bytes before parsing.
Stage A snapshots data-only values under a 256 KiB cumulative limit before composite serialization; closed
nested fields and JSON data only. No getter execution or secret in artifacts.

Manifest v1 exact fields:

```
version: "personal-model-operator-setup-v1"
setupId: canonical UUID v4 (also the proposed initial credential row ID)
expectedHead: exact 40 lowercase hex
expectedSchemaCatalogSha256: exact 64 lowercase hex
authorityId: "ENDVERA-PERSONAL-20260910-100CAD"
pilotExpiresAt: "2026-10-10T01:18:26Z"
workspaceId: nonempty bounded existing ID (max 160)
ownerUserId: nonempty bounded existing ID (max 191)
artifact: exact existing PREPARED_NOT_PUBLISHED artifact
```

No `approved:true`, caller mode flags, target, model override, key, SQL, database
URL or unbound budget fields. The manifest supplies identity **pins**, not proof
that the owner currently exists or has consented. Model/endpoint/rates/privacy
exist only inside the already reviewed artifact and are never defaulted.

DRY_RUN means pure validation, not an operational CLI mode: closed shape and
bounded mapping inspection yield `MAPPED_NOT_AUTHORIZED`, with no key prompt,
Prisma initialization/connection, environment or file write. Stage A transaction
validation additionally rebuilds the full artifact with the DB clock and existing
resolver before writes. Tests must distinguish pure inspection from that stronger
transactional check. Stage B must bind actual deployed source/schema and reviewed
manifest before invocation; supplied hashes alone are not deployment attestation.
Never run generate/migrate automatically.

All operator/rate/envelope reviews must originate inside the explicit fixed pilot
and not be future-dated. They remain eligible only until that pilot ends; no daily
manual renewal is required. Privacy must be effective/unexpired. USD/CAD conversion, additional fees,
headroom and both ceilings remain required by existing inspectors. Artifact
hashes are integrity, not evidence that documents or certifications are genuine.

## 4. Stage B — BLOCKED_ON_TRANSPORT_DESIGN

Target is source-owned: project `withered-mud-08129552`, personal branch
`br-nameless-moon-ax8nmuwj`, endpoint `ep-purple-union-axj3h2t5`, database `neondb`,
role `neondb_owner`. The later server ingress must verify its existing deployment
and DB target, never accept a URL, alternate role/database or target from a
request. It reads `ENDVERA_CONNECTOR_ENCRYPTION_KEY` from that existing server
environment; it never returns the key or transports it back to a local operator.

Comparison of the two plausible options:

- **Existing secure server invocation tooling:** preferable only if a reviewed
  mechanism actually invokes this exact helper in the deployed server environment
  with bound source/owner/input and one-use semantics. None was found in the
  inspected repository. Vercel configuration GET, the migration bridge and the
  local worker launcher do not provide this capability. Do not turn deployment
  buildCommand or a migration into a provisioning hook.
- **One-shot dedicated server operator endpoint:** plausible smallest missing
  transport if no such tooling exists, but not yet approved. It would remain
  remotely reachable even if described as private; use an exact disabled-default
  setup gate, short expiry, source-owned manifest/setupId/target pins, deployment
  protection plus operator authorization, and the actual verified owner session
  and prior model consent. Platform admin or a bearer token alone must not grant
  owner consent. No generic operation selector, model, rate, SQL, target, owner or
  artifact supplied freely by the client. A bounded request would carry only the
  new OpenRouter key and pinned setup reference, never existing encryption/DB
  secrets. The callback would use the existing server environment and Stage A
  transaction core. No redirect or secret response, log or analytics payload.

Stage B must still decide and test the exact operator authenticator, one-use
authorization binding, request/body/commit deadline, CSRF/replay controls and
durable receipt custody before any endpoint is written or deployed. Prior owner
consent is required even with deployment protection. A volatile instance-local
marker or serverless filesystem is not global replay protection or durable storage.
Database uniqueness/current-state checks remain mandatory; no new schema is
preauthorized by this plan.

Recommendation: implement/review Stage A first, then choose the one-shot server
ingress only after controller approval and verification of available invocation
tooling. No working CLI APPLY is promised. Owner access, real API key delivery and
authentic reviews remain external prerequisites, not reasons to fabricate input.

## 5. One bounded transaction; no consent or rotation

The core accepts an original caller deadline, wall plus monotonic, and refuses a
non-transaction client. Stage B owns any durable attempt record and must resolve
its custody before release; Stage A does not create a misleading local marker.
Total application budget is at most 15 seconds including ingress work;
maxWait included. One SERIALIZABLE transaction, at most 10 seconds, bounded
statement/lock timeouts from the original remaining budget. No transaction retry.

Proposed order, to confirm with native contention tests before actual use:

1. Acquire setup advisory keys in deterministic order for the exact workspace
   and fixed route/policy identities (setup writers only; do not claim existing
   disconnect/consent paths honor these new keys).
2. Read DB clock and verify current authority/expiry, verified CLIENT owner,
   exact active workspace owner and active owner membership. Hold compatible
   shared locks on owner/workspace/membership until commit.
3. Require already existing OpenRouter account, created by that owner, and a
   real active `personal_model_inference` grant carrying both current scopes
   with current-pilot grantedAt. Do not call PREPARE or CONSENT on the owner's
   behalf. Lock grant before account; re-read the account after locks. Initial
   setup requires no existing active or historical credential rows for that
   account and no credentialRef. No rotation/reconnection/adoption in this path.
4. Check route/policy IDs, key/version and hash uniqueness; refuse any partial,
   draft, retired or different existing rows. This non-spending core validates
   the artifact's reviewed ceilings but does not read or attest current budget
   availability: `budgetAvailabilityVerified:false`. It never reads/resets/increases
   a ledger or reserves money. Existing 20 CAD envelope is not refreshed by setupId;
   runtime admission still requires the real atomic USD/CAD reservation checks.
5. Rebuild the artifact using the DB clock. Map only real DB columns listed
   below. Invoke the strict initial credential helper first, after consent/owner
   validation, with credentialId=setupId. Then create one published route and one
   published policy; `publishedAt` from the captured DB clock. All writes share
   the caller transaction; caller MUST propagate errors rather than catch and commit.
6. Read back via exact-ID Prisma rows under FOR SHARE locks, compare every persisted mapped
   field/hash with the artifact, verify credential/account binding and unchanged
   consent (held grant version/lock; no grant mutation). Recheck current DB clock,
   reviews, retained owner locks and original time budget before
   returning. Concurrent revocation may block or abort; no auto retry. Never hold
   locks over a provider request, because this setup makes none. Existing gateway
   loaders omit pricingEvidence/createdBy/version on some projections and the route
   loader scans all rows; native tests compare their runtime subset separately.

Legacy disconnect takes credential/grant/account locks in its own path. Initial
credential absence reduces that intersection but is **not** a proof of global
deadlock freedom. Test concurrent consent/disconnect/owner change; timeout or
serialization failure is a refusal, never justification to weaken locks.

## 6. Real DB mapping and provenance

Route fields: id, routeKey, version, pathKind, adapterKey, billingProvider,
intermediary, endpointKey, modelKey, operationTypes, allowedDataClasses,
privacyPosture, residency, pricingEvidence, privacyEvidence, maxInputTokens,
maxOutputTokens, canonicalHash, createdBy; status=published and DB publishedAt.
Policy fields: id, policyKey, version, operationType, routeOrder, fallbackRules,
maxAttempts, maxTotalCostMicros (strict decimal to bigint), requiredPrivacyPosture,
canonicalHash, createdBy; status=published and DB publishedAt. DB createdAt defaults
stay UTC. No spread of draft descriptors into Prisma create.

Do not discard artifact review metadata or silently change the existing hashes.
Retain the exact complete non-secret artifact as an immutable reviewed sidecar;
the final receipt binds its byte hash and artifact hash
to both IDs/canonical hashes and setupId. That sidecar is required for subsequent
verification. Extra `reviewedHashes`/draft metadata are not invented DB columns.
Keep existing pricingEvidence unchanged. A sidecar is provenance linkage, not
authenticated operator review or global DB-enforced trust. Stage A receives the
full artifact in memory and tests its mapping. Stage B must establish actual
durable sidecar/receipt custody outside ephemeral serverless storage before real
use; do not claim a local wx file solves server publication durability.

In particular, route canonicalHash binds the full draft route descriptor including
reviewedHashes; policy canonicalHash also binds reviewedHashes and routeHash. It
is **not** the hash of the reduced DB loader snapshot. Readback/reconciliation
must rebuild from the retained complete artifact, compare that hash, then compare
each mapped column. DB-only comparison cannot recover omitted review metadata;
missing sidecar refuses operator reconciliation rather than inventing provenance.
The existing runtime remains responsible for its current admission guards, not
for authenticating an operator's private sidecar. A connected account here means
credential prepared; it does not mean provider verified.

## 7. One-use, ambiguity and disclosure

After any attempt, replay is **read-only reconciliation**, never another key
rotation or publication. Use setupId credential row plus exact owner/account
scope and both full route/policy mappings. Missing/partial/mismatched rows refuse;
never infer rollback from absence until transaction/connection outcome is known.
Matching rows inside the caller transaction report `STORED_SETUP_MATCH_NOT_ACTIVATED`,
with `committed:false`, without
reading/decrypting the key and without accepting replacement credential material. A reused
setupId with a mismatched independently pinned manifest/scope refuses. The first implementation exposes
this reconciliation as a separate transaction-scoped read helper. It is not a
pure function (it reads DB), a new generic endpoint or a retry flag. Existing tables
do not durably link setupId to artifact/route/policy. Accordingly
`setupTransactionProvenanceVerified:false` remains explicit: supplied matching
rows and a trusted archived manifest do not prove that one historical invocation
created all rows atomically. Stage B must preserve the attempt/commit linkage;
no new field or existing account hash is repurposed to pretend otherwise.

Historical reconciliation rebuilds the archived full artifact at the immutable
DB publishedAt, not today's clock: old rates/privacy may be stale now without
invalidating recorded publication integrity. Current owner authorization for
disclosure remains necessary. Historical equality never grants fresh admission,
permits another publication or reactivates revoked consent/credentials. Distinct
fresh application still validates all current reviews and existing consent.

If commit acknowledgement is lost or a generic Prisma error leaves the outcome
uncertain, persist a redacted uncertainty receipt and stop. Do not undo writes,
repeat application, replenish budget or create a new setupId automatically.
Known rollback and uncertain commit are separate statuses. Local receipt failure
after known commit cannot be relabeled database rollback; retain attempt evidence.

Success receipt contains only version/status, setupId, fixed target label,
source/manifest/artifact hashes, route/policy IDs+hashes, DB inspected/published
time and false flags: executionAuthorized, providerVerified, consentCreated,
runtimeActivated, billingSettled. No credential ID beyond setupId, secret hash,
URL, token, raw error, environment dump or application-source text. Error stages
come from a closed allowlist. Receipt failure must never print raw exceptions.

## 8. Activation stays a separate controller step

Remote model ENGINE and model transport must be verified OFF before setup.
Do not infer deployed flags from a test's disabled supplied environment. Global
transport may already be required by Google; do not disable or overwrite other
capabilities. Setup itself uses no transport and writes no Vercel variables.

Only after setup/readback and actual owner/source readiness, the controller may
review installation of the artifact's runtime JSON and current positive USD
OpenRouter cap, then separately enable the existing model gates. That operation
remains outside this core/ingress. No model/provider choice or billable smoke is selected
by this plan. Keep the dedicated maintenance scheduler disabled.

## 9. Required proof gates and stop conditions

- Pure tests: exact schema/limits, stale/future reviews, absent facts, tampering,
  model/endpoint pin consistency, artifact-to-runtime parity, no synthetic defaults.
- Stage A import tests: pure contract never imports/initializes DB or reads env/key;
  secret sentinels absent from all output; transaction core has no production
  caller, provider import/call, nested transaction or retry. Deadline is original.
- Transaction tests: no owner/admin-only/no consent refuses before writes;
  cross-owner account, existing credential, partial IDs, different hashes refuse;
  failure after each write rolls back all; explicit clock/owner/grant drift refuses.
- Controller native: actual helper+publisher, published immutability, exact mapped
  loader parity in UTC/New York/Tokyo, concurrent setup vs setup/disconnect,
  rollback injection, committed acknowledgement loss and read-only reconciliation.
  All synthetic; no human consent or provider verification implied.
- Stage B ingress tests are required only after transport design is accepted;
  no endpoint/CLI implementation is authorized by Stage A approval.
- Real application requires controller approval of implementation/peer review plus
  independently supplied real operator reviews and owner consent. Stop on missing
  facts/access, dirty source binding, unknown outcome or any target mismatch.

## 10. Stage A implementation record

Controller approved local implementation after the transport correction. Exported
context pins are `expectedHead`, `expectedSchemaCatalogSha256`,
`expectedArtifactHash`, `expectedManifestHash` (canonical sha256: prefix), original
`deadlineAt`, `monotoneDeadlineAt`, optional original `signal`. These are supplied
trusted-context pins, not repository/deployment attestation. An embedded manifest
cannot name the Git commit that contains itself; Stage B must bind configuration
after code source fixation or explicitly distinguish its core/deployment source.

Pure inspection returns the mapped columns, immutable copied manifest and its
canonical hash. Record-valued artifact facts retain the old artifact format; pure
inspection checks bounded JSON/integrity, while transactional application and
historical reconciliation call the actual full artifact rebuilder for grammar and
semantics. No claim that hash equality authenticates reviews.

Application returns `SETUP_PREPARED_NOT_COMMITTED`, `committed:false` and false
execution/provider/consent-created/runtime/budget-availability labels. The caller
must use one bounded SERIALIZABLE transaction (maxWait included in the original
15s entry budget), propagate errors for rollback and classify commit outcome.
The core adds a max10s wall/monotonic interval and bounded statement/lock timeout;
it cannot set the caller's Prisma transaction timeout or observe its commit.
Fixed error `PERSONAL_MODEL_SETUP_REFUSED` suppresses raw DB/input errors, but its
name is not evidence of rollback. No automatic retry or cleanup write exists.

Local baseline: missing module initially produced one failed suite with zero tests
(22:05:28 Toronto), not a vulnerability RED. Initial implemented mapping/legacy
run passed 9/9 at22:11:25; expanded core tests passed53/53 at22:15:56. The earlier
Prisma typecheck found two nullable-row narrowing errors; correction uses explicit
failure return, no relaxed runtime validation. Final results/hashes follow in the
controller/peer review. No real key, provider, DB, migration, deployment or commit
was performed by this implementation lane.

### Peer correction after the initial freeze

Peer reproduced 2 PASS / 3 FAIL at22:21:29; author rerun22:22:39 reproduced
the same cases unchanged. Nonfinite current app/monotonic clocks after credential
writes were not rejected, and Proxy reflection executed a trap. An additional
author run22:23:11 observed four failures for nested Proxy, final publisher
wall/monotonic NaN and monotonic rollback (combined47PASS/7FAIL). No HTTP caller,
real credential, provider or DB exploitation is claimed.

Correction rejects Node-detectable Proxies before reflection at every depth.
Both live guards now take exactly one wall/monotonic sample each, require finite
values and no regression from the previous accepted sample. Timeout derivation
uses those validated samples rather than a new unchecked clock read. Original
absolute deadlines remain unchanged. First corrected run78/78 PASS22:23:48;
one additive wall-clock rollback case follows. Prior native26/type proofs belong
to the previous source and must be rerun by the controller for this correction.
