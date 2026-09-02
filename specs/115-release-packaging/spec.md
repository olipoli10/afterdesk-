# Feature Specification: R35 Release Packaging

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Ready for implementation
**Input**: R35 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

ENDVERA can produce one deterministic, inspectable release-candidate package
for the Web application and the shared Expo iOS/Android application without
signing, uploading, publishing or deploying it. The package says exactly what
is built, what environment values and public URLs are required, which assets
and disclosures exist, which provider capabilities remain disabled, how an
operator validates and rolls back a later authorized release, and why the
current package is not yet production or store ready.

R35 does not create signing credentials, call EAS/App Store Connect/Google Play
or Vercel, activate a provider, choose a public production origin, publish a
privacy policy or turn local artifacts into an observed release. It creates the
closed contracts and locally reproducible evidence R36 can exercise.

## User scenarios and acceptance

### US1 — Build from one closed environment contract (P1)

An operator selects `LOCAL_INTERNAL` or `EXTERNAL_RELEASE`. One versioned
contract lists the exact required and prohibited variables for Web and mobile.
Local internal validation accepts synthetic local values and refuses secrets in
generated artifacts. External release validation stays blocked until HTTPS
public origins, secrets, providers and signing references are supplied by a
later exact authority.

### US2 — Inspect exact iOS and Android identity (P1)

An operator sees app name, slug, semantic version, iOS bundle identifier,
Android package, build numbers, URL scheme, permission copy and every required
icon/splash asset with SHA-256 and dimensions. Missing, changed or ambiguous
identity fails the package instead of being guessed.

### US3 — Review store copy and privacy disclosures (P1)

French-Canadian and English-Canadian listing drafts contain the same closed
capability and unavailable-provider claims. A structured privacy disclosure
maps each collected data class to purpose, retention authority, user control
and canonical source. Unsupported tracking, billing, live-provider, customer,
PMF or store-availability claims fail validation.

### US4 — Use support and release runbooks (P1)

An operator can follow one local build, smoke, promotion, incident and rollback
runbook. The package points to a public-path privacy route and a public-path
Construction support/status route while recording that no public production
origin or staffed external support channel is authorized yet.

### US5 — Verify a tamper-evident package (P1)

One canonical release manifest binds source commit/tree, application identities,
environment-contract version, asset hashes, disclosure hashes, runbook hashes,
test commands and boundary state. Regeneration is byte-stable for the same
inputs; mutation, missing file, path escape or untracked secret fails closed.

### US6 — Prevent accidental release actions (P1)

All packaging commands are local and write only under approved repository
paths. The validator refuses credential values, signing material, provider
enablement, external URLs in local mode, publish/deploy commands and any claim
that the artifact was signed, uploaded, reviewed by a store or observed on a
real device.

## Functional requirements

- **FR-001**: Define a closed, versioned release-package registry independent from deployment tooling.
- **FR-002**: Release targets, environment modes, artifact kinds, readiness states and refusal reasons are closed schemas.
- **FR-003**: Support exactly one shared Expo codebase targeting iOS and Android plus the canonical Next.js Web application.
- **FR-004**: Persist no secrets, OAuth tokens, provider credentials, signing certificates, provisioning profiles or store keys.
- **FR-005**: Define exact required, optional and prohibited environment variable names for each mode and runtime.
- **FR-006**: Environment validation distinguishes variable presence from secret value and never serializes values.
- **FR-007**: Local mode accepts only loopback/private origins and disabled providers; release mode requires HTTPS public origins but remains blocked without later authority.
- **FR-008**: Define canonical app name, slug, version, iOS bundle identifier, Android package, build number, version code and URL scheme.
- **FR-009**: Inventory required icon, adaptive-icon, monochrome, splash and favicon assets with path, dimensions, size and SHA-256.
- **FR-010**: Asset paths must remain repository-relative, normalized and inside the mobile asset root.
- **FR-011**: Define complete `fr-CA` and `en-CA` store listing drafts with one closed capability/status catalog.
- **FR-012**: Listing drafts must not claim live providers, billing, customer proof, product-market fit, store availability or production readiness.
- **FR-013**: Define a structured privacy disclosure for identity, contacts, schedule, project, evidence, communications, financial workflow, diagnostics and human-escalation data.
- **FR-014**: Each disclosure states collection, purpose, persistence, sharing state, retention authority and user control.
- **FR-015**: Tracking, advertising, data sale and broad mailbox/contact-book collection remain false.
- **FR-016**: Microphone wording remains bounded to a user-chosen local voice note; background recording is prohibited.
- **FR-017**: Define privacy, support, security and account-deletion public paths separately from unresolved production origins.
- **FR-018**: Add a public Construction support/status route that makes current local-only availability explicit and provides no fabricated staffed channel.
- **FR-019**: Add mobile settings release information with local version, build identity and privacy/support paths without exposing configuration values.
- **FR-020**: Define local Web/mobile build, smoke, evidence, promotion, incident, rollback and release-stop runbooks.
- **FR-021**: Define a release manifest with source head/tree, schema versions, identities, hashes, validation commands and exact authority boundary.
- **FR-022**: Canonical manifest generation is byte-stable for identical tracked inputs.
- **FR-023**: Manifest validation verifies all referenced hashes and refuses missing, extra, absolute or escaping paths.
- **FR-024**: The manifest records `signed=false`, `uploaded=false`, `published=false`, `deployed=false`, `providerObserved=false` and `externalEffectCount=0`.
- **FR-025**: Release readiness remains `LOCAL_PACKAGE_READY` at most; store, provider and Production readiness remain blocked.
- **FR-026**: Add no dependency and change neither root nor mobile lockfile.
- **FR-027**: All validator and generator commands are non-networked, deterministic and safe to repeat.
- **FR-028**: Unit and mutation tests cover environment leakage, asset mutation, disclosure drift, claim inflation, path escape and release-action inflation.
- **FR-029**: R33 parity and R34 commercial/public surfaces remain green.
- **FR-030**: No provider, credential, customer data, external transport/write, signing, EAS/store/Vercel action, push, Preview, Production or deployment is permitted.

## Failure and exception states

Unknown release mode, missing identity, invalid build number, duplicate target,
missing or mutated asset, path escape, unresolved public origin, secret-shaped
value, provider enabled, disclosure mismatch, missing translation, unsupported
claim, stale source fingerprint, non-deterministic manifest or release-action
claim returns one closed refusal reason and produces no promoted package.

## Success criteria

- One local command creates the same canonical manifest twice from the same commit/tree.
- All required Web/iOS/Android identities and asset hashes validate exactly.
- Zero secret value appears in any package, log fixture or tracked file.
- French and English store capability/status catalogs are structurally equal.
- Privacy disclosure covers every product data class and claims no tracking, sale or advertising.
- Public privacy/support/security/deletion paths are explicit while public origin remains unresolved.
- Mobile settings shows version/build and safe policy paths without configuration leakage.
- A one-byte asset or disclosure mutation fails its exact guard and restores byte-exactly.
- Local package state is exactly `LOCAL_PACKAGE_READY`; signed/uploaded/published/deployed/provider-observed counts remain zero.
- R33/R34 and full root/mobile quality gates remain green.

## Assumptions and dependencies

- R33 is authoritative for Web/iOS/Android product parity.
- R34 is authoritative for commercial and public capability/status claims.
- R30 is authoritative for privacy, retention, export and deletion state.
- Existing app assets and identifiers are candidate inputs, not store-approved evidence.
- Public production origins, signing teams, store accounts and support staffing require later exact authority.

## Out of scope

Signing, certificates, provisioning, EAS login/build/submit, TestFlight, Play
Console, store review, app upload, Vercel action, DNS, public production URLs,
provider credentials, live providers, customer data, release approval, public
pricing, payment, customer support staffing, push, Preview, Production and
Verified-E2E.
