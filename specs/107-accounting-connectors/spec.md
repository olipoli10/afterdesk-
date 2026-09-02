# Feature Specification: R27 Accounting Connectors

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`  
**Created**: 2026-09-02  
**Status**: In progress  
**Input**: R27 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

ENDVERA gains one canonical accounting cockpit that can accept normalized
QuickBooks Online or Xero invoice and payment observations, reconcile them with
the existing R21 project receivables, and prepare exact accounting changes for
review. R27 never authenticates to a provider, reads an account, creates an
invoice, records a payment or changes an external ledger.

The accounting provider is not the project-memory source of truth. ENDVERA
retains project/evidence/readiness state and records provider observations with
their provenance. Any disagreement remains visible until an authorized owner or
office user resolves it.

## User scenarios and acceptance

### US1 — Prepare a least-privilege accounting account (P1)

An owner prepares a disabled QuickBooks Online or Xero account plan with
separate read-receivables, read-payments, prepare-invoice and
prepare-reconciliation capabilities. No OAuth value, company identifier or
credential is persisted or exposed. Replay is idempotent and revocation is
immediate.

### US2 — Reconcile normalized accounting observations (P1)

A trusted disabled adapter supplies one normalized external invoice or payment
observation. ENDVERA binds it to one workspace and, when exact evidence exists,
one project receivable. Exact replay has one effect. Ambiguous amount, customer,
currency, invoice number or project matching produces a review item with zero
canonical settlement write.

### US3 — Prepare an exact accounting change (P1)

For an R21 invoice-ready dossier, an owner prepares an exact external invoice
draft containing provider, project, contact, currency, line items, taxes,
evidence references and canonical fingerprint. A reconciliation draft can bind
one observed payment to one receivable. Approval is exact-version and exact-hash
bound, but both operations remain `APPROVED_UNPOSTED`.

### US4 — Inspect role-safe accounting state (P2)

Owners and office users see account readiness, canonical receivables, provider
observations, unresolved differences and prepared drafts after restart. Field
workers see no invoice amount, payment, customer accounting identity, tax,
margin, recipient or accounting evidence detail.

## Functional requirements

- **FR-001**: Reuse R21 receivables/invoice readiness, R10/R11 exact inspection/approval, R16 permissions and R17 restart-safe commands.
- **FR-002**: Support provider-neutral `QUICKBOOKS_ONLINE` and `XERO` account kinds while all adapters remain disabled.
- **FR-003**: Separate read-receivables, read-payments, prepare-invoice, prepare-reconciliation and external-write capabilities; external write is always false in R27.
- **FR-004**: Persist only opaque account, tenant, invoice, payment and cursor references; never OAuth tokens, credentials, raw provider URLs or provider secrets.
- **FR-005**: Require a trusted adapter assertion, active workspace membership and active locally prepared account for normalized observations.
- **FR-006**: Bind each observation to exactly one workspace and at most one exact canonical receivable/project.
- **FR-007**: Perform zero settlement, balance or invoice-status write when resolution is absent, ambiguous, unauthorized, stale or cross-workspace.
- **FR-008**: Detect exact replay and concurrent duplicates; conflicting identity reuse is refused without overwriting original evidence.
- **FR-009**: Preserve provider amount, currency, status and update sequence as observations, not verified canonical facts.
- **FR-010**: Reconcile only exact currency and amount against an open R21 receivable with sufficient project/contact/invoice evidence.
- **FR-011**: Preserve partial payments, overpayments, conflicting status and unmatched observations as explicit unresolved states.
- **FR-012**: Prepare an external invoice draft only from one `READY_TO_INVOICE` canonical dossier and admitted same-project evidence.
- **FR-013**: Expose exact contact, currency, line items, taxes, due date, evidence and canonical fingerprint before approval.
- **FR-014**: Bind invoice and reconciliation approval to exact version, payload hash, provider and canonical source versions.
- **FR-015**: Keep all accounting operations `PREPARED_UNPOSTED` or `APPROVED_UNPOSTED`, with `externalWrite=false` and `externalEffectCount=0`.
- **FR-016**: Provide one protected API and shared iOS/Android accounting cockpit with restart-safe commands.
- **FR-017**: Recursively omit financial, tax, customer, payment and accounting-evidence detail from field projections.
- **FR-018**: Retain immutable provenance for preparation, revocation, observation, matching, refusal, draft and approval decisions.

## Authorization and tenancy

Account management, financial inspection, matching, draft creation and approval
require owner/admin office authority. Every lookup is workspace scoped. Missing
or foreign records fail as not found. A field role cannot infer the existence,
amount or status of accounting records.

## Failure and exception states

`NOT_CONFIGURED`, `PREPARED_DISABLED`, `SYNC_REQUIRED`, `UNMATCHED`,
`AMBIGUOUS`, `CONFLICT_REQUIRES_REVIEW`, `PREPARED_UNPOSTED`,
`APPROVED_UNPOSTED`, `REFUSED` and `REVOKED` are explicit. Provider downtime or
successful provider posting cannot be claimed because no provider is active.

## Success criteria

- Exactly one accounting observation/effect for exact replay or concurrency.
- 0 canonical settlement writes from ambiguous or conflicting observations.
- Exact matching requires workspace, currency, amount and canonical evidence.
- 0 provider credential, raw URL, external request, accounting write or effect.
- Exact invoice/reconciliation inspection and approval with stable hashes.
- 0 field-worker financial or accounting-detail leakage.
- Identical cockpit and prepared state after restart.
- One shared iOS/Android implementation.

## Out of scope

- live QuickBooks/Xero OAuth, API, webhook, polling, sandbox or production call;
- provider-side invoice, payment, journal, bank-feed or attachment write;
- automatic bookkeeping, tax advice, payroll, payments or bank access;
- customer data, external transport, push, Preview, Production, EAS or store action.
