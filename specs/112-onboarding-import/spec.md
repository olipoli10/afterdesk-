# Feature Specification: R32 Contractor Onboarding and Bounded Import

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Ready for implementation
**Input**: R32 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

A small construction contractor can create a role-safe ENDVERA workspace, add
the first real operating context and reach one useful canonical project state
without technical setup. Existing contacts and projects can be imported through
one bounded preview-and-commit flow that explains rejected rows, duplicates and
required decisions before anything canonical changes.

R32 is not a generic migration platform, CRM configurator or provider sync. It
reuses the existing Construction workspace, project, contact, membership,
permission and audit models. Imports are local application commands with exact
idempotency and provenance; no mailbox, phone book, accounting system, calendar
or external provider is contacted.

## User scenarios and acceptance

### US1 — Start one contractor workspace (P1)

An authenticated client without a Construction workspace enters company name,
timezone and locale. ENDVERA creates exactly one workspace and owner membership
or resumes the existing one. Repeating the command does not create a second
workspace. A non-owner cannot alter the organization profile.

### US2 — Reach first operational value (P1)

The owner creates one first project and at least one contact, or imports valid
equivalents. The onboarding cockpit then shows the canonical project, contact,
current readiness, missing optional setup and one next decision. It does not
force calendar, messaging, voice, accounting or billing setup before value.

### US3 — Preview a bounded import (P1)

The owner supplies a UTF-8 CSV for contacts or projects. ENDVERA parses at most
500 data rows using a closed column map, normalizes values, and returns an
immutable preview. Each row is `READY`, `DUPLICATE`, `CONFLICT` or `INVALID`
with exact reason codes. Preview performs zero canonical contact/project write.

### US4 — Resolve ambiguity before commit (P1)

Duplicate and conflicting rows remain visible. The owner explicitly chooses
`SKIP`, `CREATE_NEW` where safe, or `USE_EXISTING` with one exact same-workspace
candidate. Unknown columns,
cross-workspace identifiers, malformed coordinates and ambiguous project links
refuse. ENDVERA never silently merges or overwrites canonical records.

### US5 — Commit exactly once (P1)

The owner commits one unchanged preview version. The server rechecks the source
hash, row decisions, workspace, role and current canonical conflicts inside one
transaction. Retry returns the same result; altered reuse or stale preview
refuses. Either all accepted rows and audit records commit, or none do.

### US6 — Resume the same onboarding on web, iOS and Android (P2)

The onboarding session persists after navigation, app restart or sign-in on
another shared client. Web and Expo render the same strict contract, one clear
step at a time. Field workers receive only an invitation/assignment summary and
never organization import controls or unassigned contact/project data.

## Functional requirements

- **FR-001**: Every session, batch, row, decision and command carries exact `workspaceId` where a workspace exists; active membership and role are rechecked at point of use.
- **FR-002**: Define closed onboarding stages, import kinds, row states, decision actions, reason codes and completion states; unknown values refuse.
- **FR-003**: Workspace creation is idempotent per owner and may not create a parallel Construction workspace when one already exists.
- **FR-004**: Locale is limited to supported product locales and timezone must be an accepted IANA identifier.
- **FR-005**: Reuse canonical Construction workspace, membership, project and contact records; no duplicate onboarding copy becomes authoritative.
- **FR-006**: Onboarding progress is a versioned projection with immutable command results and one explicit next required or optional action.
- **FR-007**: First-value readiness requires one active workspace, one canonical project and one canonical contact associated with that workspace.
- **FR-008**: Connector, billing, provider and advanced policy setup remains optional and must not block first-value readiness.
- **FR-009**: Import accepts only `CONTACTS_CSV` and `PROJECTS_CSV` in registry version 1.
- **FR-010**: Import input must be UTF-8 text, bounded to 500 data rows and 1 MiB, with a closed allowlist of columns and bounded field lengths.
- **FR-011**: Contact columns are limited to display name, role, phone, email and optional project code; project columns are limited to code, name and address.
- **FR-012**: Phone/email normalization uses existing canonical policies; only normalized coordinates required for owner review and canonical contact creation are retained. Raw CSV text and coordinates never enter telemetry or field projection.
- **FR-013**: Each import preview records source hash, parser version, column mapping, row count, exact normalized row fingerprints and reason codes.
- **FR-014**: Preview is immutable and creates zero canonical project/contact/member record.
- **FR-015**: Duplicate detection uses workspace-scoped canonical keys and normalized identity; ambiguous candidates are `CONFLICT`, never auto-merged.
- **FR-016**: Row decisions are version-bound and limited to `SKIP`, safe `CREATE_NEW`, or `USE_EXISTING` with one exact same-workspace canonical candidate. Unsupported overwrite, merge or ambiguous match refuses.
- **FR-017**: Commit revalidates every accepted row against current canonical state and refuses a stale batch instead of applying a changed interpretation.
- **FR-018**: Commit is atomic across canonical records, provenance, audit and batch result.
- **FR-019**: Exact retry returns one immutable result; command-ID or source-hash collision refuses.
- **FR-020**: Cross-workspace project links, contact matches, batches and row decisions return not found or refuse without disclosure.
- **FR-021**: Owner/office and field schemas are independent; field output excludes import rows, coordinates, duplicate candidates, organization totals and unassigned records.
- **FR-022**: The onboarding API is authenticated, rate-limited, private/no-store and accepts no caller-supplied actor, role or completion status.
- **FR-023**: Web and shared Expo iOS/Android show one current step, preview counts, exact decisions, commit result and next action from PostgreSQL.
- **FR-024**: Every refusal and commit is reconstructible from canonical identifiers, versions, hashes and reason codes without storing file bytes in logs.
- **FR-025**: No provider call, external transport, external write, customer data, OAuth, credential, push, Preview, Production, deployment or store action is permitted.

## Failure and exception states

Missing membership, owner mismatch, unsupported locale/timezone, oversized or
non-UTF-8 input, unknown/duplicate column, malformed row, duplicate project
code, ambiguous contact identity, stale preview, altered decision, cross-tenant
reference, command collision or partial transaction causes an exact refusal.
Unavailable optional connector setup is `OPTIONAL`, never a failed onboarding.

## Success criteria

- Repeating workspace initialization creates exactly one workspace and owner membership.
- A synthetic owner reaches first-value readiness with one project and one contact in at most five product actions.
- A 500-row synthetic preview is bounded, deterministic and creates zero canonical project/contact row.
- Every invalid, duplicate and conflicting row has at least one closed reason code.
- No ambiguous row is silently merged, overwritten or committed.
- Exact commit retry creates no second canonical effect; altered or stale retry refuses.
- Atomic failure leaves canonical, audit and import counts unchanged.
- Restart returns the same session, preview version, decisions and next action.
- Field projection exposes zero import detail, contact coordinate or unassigned project.
- Web/iOS/Android parse the same strict onboarding contract.
- Provider, external-effect and customer-data counts remain zero.

## Assumptions and dependencies

- Existing Construction workspace/project/contact creation functions and point-of-use membership guards remain canonical.
- Existing contact normalization and audit functions are reused rather than forked.
- CSV v1 is intentionally small and deterministic; XLSX, OCR, accounting, phone-book and provider imports require later reviewed adapters.
- Local synthetic evidence can prove correctness and usability mechanics, not customer adoption or provider readiness.

## Out of scope

Real customer imports, invitations by external email/SMS, Google/Apple contacts,
calendar/accounting/mailbox sync, provider activation, billing signup,
production migration consulting, automatic overwrite/merge, deployment,
Preview, Production and app-store publishing.
