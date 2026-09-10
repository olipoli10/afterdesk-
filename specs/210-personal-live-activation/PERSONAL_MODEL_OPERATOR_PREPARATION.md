# Personal model: offline operator preparation

State: **draft preparation only**. No route is published, no permission is granted,
no key is read and no provider call is made by this helper. Synthetic fixtures are
not real reviews, endpoint certification, billing reconciliation or model-quality proof.

## Entry points

`src/server/model-gateway/personal-intent/operator-preparation.ts` exports:

- `preparePersonalModelOperatorArtifact({ enabled: true, configuration }, now)`:
  opt-in local inspection; omission of `enabled` returns `DISABLED` before inspecting inputs.
- `validatePersonalModelOperatorArtifact(artifact, now)`: rebuilds from exact reviewed
  inputs under current code and time, then verifies the entire serialized artifact.

Neither function reads environment variables, the filesystem, credentials or a database.
No executable SQL, activation script or fake owner/session is produced.

## Required operator inputs

The closed `configuration` object contains:

- `operatorReview`: `reviewerRef`, `reviewedAt`, and four document records named
  `rates`, `fxAndFees`, `privacy`, `totalEnvelope`; each has `reviewRef` and
  `contentHash` (`sha256:` plus 64 lowercase hex characters). References must identify
  real reviewed documents when preparing a real configuration. No secret belongs here.
- `pilotContext`: explicit current `authorityId` and `expiresAt`, matching the
  existing personal pilot. This is a supplied context, not a new authority.
- `rateConfiguration`: the complete existing `inspectPersonalModelBudget` input;
  exact model and endpoint slug, context/output ceilings, reviewed USD token rates,
  all additional fees, CAD/USD conversion, headroom, model/per-call CAD ceilings.
- `pilotEnvelopeReview`: the existing current total-pilot review input. Model
  allocation remains at most 20 CAD within the 100 CAD pilot envelope; this does
  not establish actual remaining balance or settled cost.
- `privacyEvidence`: the existing gateway's closed 14-field route evidence, supplied
  by the operator, covering the exact intermediary, endpoint, model, data class,
  privacy posture, residency, tenancy, certification owner and validity period.
  The helper never fills in a certification owner or infers zero retention.
- `route`: explicit future `id`, positive `version`, unique nonempty `residency`,
  and positive `maxInputTokens` no larger than the reviewed model context.
- `policy`: explicit future `id` and positive `version`.

Operator, rate and envelope reviews must be current (at most 24 hours old, not
future-dated). The pilot must be active. Privacy must be effective and unexpired.
Output tokens are pinned exactly, at most 8192; retries and fallback remain absent.

## What the artifact means

Missing/invalid inputs return `INCOMPLETE` and bounded prerequisite codes, never raw
exceptions or supplied values. Complete structural inputs return
`PREPARED_NOT_PUBLISHED`, with `executionAuthorized:false`,
`publicationAuthorized:false`, `reviewAuthenticityVerified:false` and
`providerCompatibilityObserved:false`.

The existing registry, budget/envelope inspectors and `resolveGatewayPolicy` are
reused. The resolver only accepts published snapshots, so the helper performs a
clearly local, in-memory publication-state simulation. That probe is not persisted,
returned as an admission, or dispatched. Returned route and policy remain **draft**,
with `publishedAt:null`. All returned runtime switches remain disabled:
`ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED=false`,
`ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED=false`, and
`ENDVERA_EXTERNAL_TRANSPORT_ENABLED=DISABLED`.

The JSON-only artifact contains original reviewed inputs, document references,
exact reviewed hashes, linked policy/route hashes, output-contract hash and prompt
version. Its canonical hash binds the complete artifact. The draft descriptors
include review metadata in addition to DB fields: they are **not** direct Prisma
`create` arguments. A future publisher must keep the reviewed artifact as the
provenance sidecar, explicitly map existing DB columns and revalidate this exact
artifact before writing. Never silently discard or replace its review bindings.

## Prerequisites that remain outside this helper

An operator still must verify document authenticity and exact provider/model
structured-output compatibility, refresh rates/FX/fees and reconcile all pilot
exposure. A future authorized publisher must check unique IDs/versions, existing
governance rules and immutable published-row constraints; this helper does not
make that publication or supply authority to do so.

Actual admission still requires authenticated current owner and source permissions,
explicit current AI consent, encrypted current credential binding, clear breakers,
actual input-size fit, current USD account cap and atomic USD/CAD reservations.
Actual transport additionally requires explicit engine, model transport and global
transport activation. None of those facts is proven by this artifact. A valid model
proposal still is untrusted, review-only and not permission to act.

Tests use fabricated **synthetic-only** documents and model names to exercise these
boundaries. They are never a ready-to-enable production configuration.
