# Feature Specification: R26 Project Email Inbox

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`  
**Created**: 2026-09-02  
**Status**: In progress  
**Input**: R26 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

ENDVERA gains one project-bound email inbox that can accept normalized messages
from future Gmail or Microsoft adapters, associate them with the correct
workspace, contact and chantier, retain selected attachments as evidence, and
prepare exact outbound replies for approval. It does not obtain broad mailbox
authority, connect a provider, fetch remote attachments or send an email in R26.

R26 reuses the existing canonical project/contact memory, selected-evidence
security boundary, unified intent router and prepared-action approval model. It
MUST NOT create a second assistant, a general mailbox client or a provider-
specific source of truth.

## User scenarios and acceptance

### US1 — Admit one project email safely (P1)

An authorized owner or office user receives a normalized email through a
trusted disabled adapter. ENDVERA verifies the opaque account, sender and
message identity, resolves one project/contact, stores one canonical message
and routes only verified content through the existing intent engine. Exact
replay creates no second message or project effect. Ambiguous, unauthorized,
cross-workspace or unbound mail asks for clarification without a consequential
write.

### US2 — Preserve selected email evidence (P1)

An admitted email references attachments that have already crossed ENDVERA's
selected-file security boundary. ENDVERA links only same-workspace/project
evidence, preserves source hashes and contradictory claims, and never downloads
a remote attachment or invents its contents.

### US3 — Prepare an exact outbound email (P2)

An owner or office user selects an exact contact/project and prepares a reply
with visible To, optional Cc, subject, body, thread reference and selected
attachments. ENDVERA records a versioned `PREPARED_UNSENT` action. Approval is
bound to the exact version and payload hash; provider send remains disabled.

### US4 — Inspect and revoke safely (P2)

Owners and office users see the project email timeline, proof, clarification,
prepared replies and connector state after restart. Field workers see only
explicitly assigned minimized items and never unrestricted bodies, recipients,
financial facts or attachment content. Local connector preparation can be
revoked immediately without deleting immutable history.

## Edge cases

- A Gmail history cursor expires or a Microsoft folder cursor changes.
- One message references multiple projects or an unknown sender.
- The same provider message arrives concurrently with different content.
- A reply changes after approval or references evidence from another workspace.
- An email thread moves folders, is resent, or arrives with only metadata.
- Revocation occurs while a local command is queued for retry.
- A field worker is assigned to a follow-up containing financial email content.

## Functional requirements

- **FR-001**: Reuse canonical construction project/contact memory, R14 selected evidence, R18 intent routing and version-bound prepared-action controls.
- **FR-002**: Support provider-neutral Gmail and Microsoft account kinds while all provider adapters remain disabled.
- **FR-003**: Separate metadata-read, selected-content-read, draft-preparation and send capabilities; send is always disabled in R26.
- **FR-004**: Persist only opaque account, mailbox/folder, message, thread and cursor references; never OAuth credentials, refresh tokens or raw provider delta URLs.
- **FR-005**: Require trusted adapter authenticity, active workspace membership and an active locally prepared account.
- **FR-006**: Bind every canonical email to exactly one workspace and at most one resolved project/contact.
- **FR-007**: Ask for clarification and perform zero consequential project write when project/contact resolution is ambiguous or absent.
- **FR-008**: Detect exact replay and concurrent duplicates; conflicting reuse of an identity is refused without overwriting the first fact.
- **FR-009**: Treat provider cursors as opaque, monotonic adapter state and expose resynchronization-required status without guessing missing mail.
- **FR-010**: Route only admitted normalized text through R18 with explicit email provenance and verification state.
- **FR-011**: Link only already-admitted same-workspace/project evidence; never fetch or interpret remote attachments implicitly.
- **FR-012**: Preserve contradictory claims, original normalized content hash, supplied timestamps and immutable decisions.
- **FR-013**: Prepare outbound email only with exact To/Cc/subject/body/thread/evidence inspection and a stable version/payload hash.
- **FR-014**: Refuse stale approval, altered payload, cross-workspace evidence, revoked account and second delivery attempt.
- **FR-015**: Keep every outbound email in `PREPARED_UNSENT`; external transport is always false.
- **FR-016**: Provide restart-safe mobile commands and one shared iOS/Android email inbox.
- **FR-017**: Owner/admin projections may expose admitted normalized content; field projections recursively omit unrestricted body, recipient, financial and evidence detail.
- **FR-018**: Retain immutable audit provenance for account preparation/revocation, admission, routing, clarification, evidence links, drafts and approvals.

## Key entities

- **Email account state**: opaque provider/account/folder scope, capabilities,
  cursor state, local status and revocation facts.
- **Email event**: one normalized inbound message identity, canonical message,
  content hash, routing state and immutable provenance.
- **Email evidence link**: same-project reference to already admitted evidence.
- **Prepared email draft**: exact versioned recipients, subject, body, thread,
  attachment references, approval and transport-disabled state.
- **Email decision**: immutable transition and refusal record.

## Authorization and tenancy

Account preparation, full-content inspection, drafts and approvals require an
owner/admin. Every lookup is workspace scoped. Field users receive only
explicitly assigned minimized projections. Missing or foreign records fail as
not found.

## Data classification and retention

Normalized email bodies and subjects are restricted operational content.
Recipient references, evidence links and financial claims are confidential.
OAuth secrets, raw provider tokens and remote attachment URLs are prohibited.
Immutable provenance remains reconstructible after local revocation.

## Failure and exception states

`NOT_CONFIGURED`, `PREPARED_DISABLED`, `SYNC_REQUIRED`, `CLARIFICATION_REQUIRED`,
`REFUSED`, `REVOKED`, `PREPARED_UNSENT` and `APPROVED_UNSENT` are explicit.
Provider outages cannot be claimed or simulated because no provider is active.

## Economics and demand

R26 adds no provider spend and measures no willingness to pay. Provider review,
verification, mailbox storage, attachment transfer and support costs remain
UNKNOWN until an authorized real-pilot plan. Demand evidence date: 2026-09-02.

## Verification, observability and rollback

Disposable PostgreSQL tests prove replay, concurrency, restart, cursor drift,
tenant isolation, attachment constraints, approval binding and zero transport.
Every operation exposes one stable status/reason and audit fingerprint. Rollback
is local connector revocation plus application rollback; the migration is
forward-only and immutable history is retained.

## Success criteria

- 100% admitted messages associated with the authorized workspace and correct project when resolvable.
- Exactly one canonical email/event/effect for exact replay and concurrent duplicate input.
- 0 consequential writes from ambiguous, unverified or cross-workspace input.
- 0 invented body, attachment fact, cursor event, consent or delivery.
- 0 provider credential, raw delta link or unrestricted mailbox authority persisted.
- 0 field-worker body, recipient, financial or evidence-detail leakage.
- Identical account, inbox and draft state after restart.
- 0 external provider request, mailbox read, email send or transport.
- iOS and Android share one email inbox implementation.

## Out of scope

- live Gmail API, Microsoft Graph, OAuth, webhook, Pub/Sub or subscription;
- broad mailbox access, general email client or background sync;
- remote attachment download or provider-side draft creation;
- live email send, customer/prospect data, push, Preview, Production, EAS or store action.
