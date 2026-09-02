# Feature Specification: R30 Tenant Privacy Control Plane

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Complete
**Input**: R30 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

An owner can understand and control what ENDVERA retains for one Construction
workspace without receiving raw database dumps or secret material. ENDVERA
maintains a versioned retention policy, reconstructs a tenant-scoped data
inventory, prepares a minimized export manifest, evaluates deletion requests
against legal/operational holds, shows evidence and connector-secret lifecycle
state, and records every decision immutably.

R30 does not silently erase operational history. Deletion is a two-step,
version-bound lifecycle. Local code may prepare, approve and tombstone only
eligible synthetic records owned by the disposable test workspace. External
storage deletion, provider revocation and customer-data processing remain
disabled.

## User scenarios and acceptance

### US1 — Inspect one tenant boundary (P1)

An owner opens Privacy and sees only the selected workspace's resource counts,
memberships, evidence lifecycle, connector secret-reference state and active
retention policy. A field worker receives only a minimal statement about their
own effective access and never an inventory, export or deletion control.

### US2 — Version retention rules (P1)

An owner creates a complete draft for closed data classes, activates the exact
version and later supersedes it without mutating history. Missing classes,
unsafe zero-day retention, stale versions and concurrent activation fail
closed.

### US3 — Prepare a privacy export (P1)

An owner prepares one workspace-scoped export manifest. It includes canonical
entity counts, time bounds, policy version and SHA-256 fingerprint, but excludes
credentials, raw storage keys, provider tokens, password/auth data and hidden
worker economics. Exact replay returns one result; altered reuse refuses.

### US4 — Control deletion without accidental erasure (P1)

An owner requests deletion for one closed target type and ID. ENDVERA evaluates
workspace ownership, retention, operational dependency, active dispute/hold,
immutable-audit obligations and evidence state. Eligible requests require a
second exact approval. Ineligible, stale, cross-workspace and broad-workspace
deletion refuse. R30 records a tombstone for eligible synthetic evidence; it
does not delete immutable facts, financial records or external objects.

### US5 — Inspect secret and evidence lifecycle (P2)

The owner sees whether connectors contain no credential reference, an opaque
reference or a revoked reference, never the reference itself. Evidence is shown
as active, held, retention-due, tombstoned or externally-pending. No UI can
claim provider revocation or physical deletion without observed proof.

### US6 — Use one shared web/iOS/Android privacy center (P2)

The protected private/no-store API feeds web and shared Expo surfaces. Unknown
fields, malformed fingerprints, mixed workspaces and role mismatches fail
closed. Mobile retry preserves one command identity and never auto-approves a
deletion.

## Functional requirements

- **FR-001**: Every policy, operation, inventory row and lifecycle result must be scoped by exact `workspaceId` and active membership rechecked at point of use.
- **FR-002**: Define closed privacy data classes: `IDENTITY`, `COMMUNICATION`, `PROJECT_STATE`, `EVIDENCE`, `FINANCIAL`, `CONNECTOR_METADATA`, `AUDIT` and `HUMAN_WORK`.
- **FR-003**: Persist immutable versioned retention policy sets with complete rules, one active version per workspace and draft-only editing.
- **FR-004**: Enforce safe retention floors and an explicit `LEGAL_OR_OPERATIONAL_HOLD` override; zero or negative retention must refuse.
- **FR-005**: Reconstruct the inventory from canonical workspace-scoped tables; do not create a second source of truth.
- **FR-006**: Count and classify connector secret lifecycle without returning `credentialRef`, token, OAuth material, provider account key or raw secret value.
- **FR-007**: Classify evidence lifecycle without returning storage keys, raw source references, message bodies or unauthorized financial data.
- **FR-008**: Prepare an export manifest in PostgreSQL with schema version, policy version, entity counts, time bounds and canonical SHA-256 fingerprint.
- **FR-009**: Export manifests must exclude authentication data, credentials, storage keys, provider tokens, hidden worker economics and other-workspace data recursively.
- **FR-010**: Exact command replay returns the original result; altered command reuse, concurrent duplicate and stale expected versions refuse durably.
- **FR-011**: Support closed deletion target types only; workspace-wide, wildcard, raw SQL and arbitrary table targets are prohibited.
- **FR-012**: Deletion lifecycle must be `REQUESTED`, `BLOCKED`, `ELIGIBLE`, `APPROVED`, `TOMBSTONED`, `EXTERNAL_DELETION_PENDING`, `REFUSED` or `REVOKED`.
- **FR-013**: Approval must bind target, requester, policy version, eligibility fingerprint and expected lifecycle version.
- **FR-014**: Immutable audit, financial, contradiction, authority-decision and accepted human-result records may never be physically deleted by R30.
- **FR-015**: Eligible synthetic evidence deletion creates a workspace-scoped tombstone and preserves non-sensitive proof that deletion was requested and adjudicated.
- **FR-016**: External object deletion and provider credential revocation remain `EXTERNAL_DELETION_PENDING` or disabled until separately authorized and observed.
- **FR-017**: Owner/office and field-worker response schemas must be independent; field workers receive only their own access summary and no privacy operation controls.
- **FR-018**: The API must be authenticated, rate-limited, private/no-store and return cross-workspace resources as not found.
- **FR-019**: Web and shared Expo iOS/Android privacy centers must expose inventory, policy, export, deletion and lifecycle state according to role.
- **FR-020**: No provider call, external transport, external write, customer data, OAuth, credential, push, Preview, Production, deployment or store action is permitted.

## Failure and exception states

Missing membership, unknown class/target, incomplete policy, unsafe retention,
stale version, malformed hash, broad deletion, active hold, retained dependency,
cross-workspace ID, hidden-field leak or external-effect claim causes refusal.
Absence of physical provider/storage proof remains explicit pending state.

## Success criteria

- Two synthetic workspaces remain isolated in inventory, export and operations.
- One active complete policy exists per workspace with immutable superseded history.
- Export manifest is deterministic across restart and contains zero forbidden key.
- Exact retry and concurrent retry create one canonical operation.
- Held and protected records cannot become deletion-approved.
- Eligible synthetic evidence reaches tombstone once, without external deletion.
- Field projection contains zero inventory, money, source, secret or operation internals.
- Web/iOS/Android share the same fail-closed contract.
- Provider/external effect count remains zero.

## Out of scope

- Real customer data, legal advice, provider token storage/revocation, external
  object deletion, broad account erasure, production retention jobs, data
  residency claims, push, Preview, Production, deployment or store publishing.
