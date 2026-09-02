# Feature Specification: R36 Full Synthetic Internal E2E

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Ready for implementation
**Input**: R36 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

One deterministic synthetic contractor story crosses the real canonical
PostgreSQL services and the strict Web/shared-mobile contracts from first
onboarding to an invoice-ready decision, including an ambiguity, missing
evidence, prepared communications, human exception, exact resume, process
restart and role-safe final projections. The run proves the locally built
parts compose as one operating assistant instead of isolated feature tests.

R36 does not call a model, provider, browser service, external transport,
calendar, phone, email, accounting system, store or deployment. Natural-
language intent inputs use the versioned local deterministic interpreter
already accepted for synthetic proof. R36 is internal E2E, not Verified-E2E.

## Synthetic story

- workspace: `ENDVERA Construction — Internal E2E`;
- owner and office manager: synthetic;
- field worker: synthetic and assigned only to one project;
- project: `LAVAL-E2E-001 — Rénovation Laval`;
- contact: `Marc — Fournisseur` with synthetic coordinates;
- extra: `Dosseret de cuisine — 1 200 CAD`;
- timezone: `America/Toronto`;
- all messages, photos, documents, invoices and identifiers: synthetic.

## User scenarios and acceptance

### US1 — Reach first canonical value (P1)

The owner completes onboarding, creates/imports the workspace, contact and
project, and issues a clear appointment command. Exactly one appointment is
stored for the right project and appears identically through Web and shared
iOS/Android contracts.

### US2 — Resolve ambiguity and missing evidence (P1)

An ambiguous appointment creates a clarification and zero consequential write.
The owner says the extra is complete and approved while written approval and
work evidence are absent. The system preserves the claims, detects both gaps,
keeps the file not ready to invoice and identifies the next responsible human.

### US3 — Complete the economic workflow (P1)

Synthetic written approval and one synthetic evidence reference are added.
The contradiction is resolved by an authorized owner decision. The canonical
invoice-readiness state becomes exactly `READY_TO_INVOICE`, remains one dossier
under duplicate/replay, and is visible only to permitted roles.

### US4 — Prepare actions and survive an exception (P1)

Calendar, SMS, voice, email and accounting connectors remain disabled. Exact
actions are prepared but unsent. A bounded Human Work Unit is created for an
exception, inspected by the permitted worker/reviewer, completed locally and
resumes the originating workflow once with preserved context.

### US5 — Recover and reconstruct after restart (P1)

The database client/process boundary is restarted. Queue/outbox replay and one
simulated transient failure create no duplicate effect. Final project,
timeline, calendar, inbox, receivables, provenance, commercial account,
privacy and reliability projections reconstruct the same state fingerprint.

### US6 — Preserve role and platform parity (P1)

Owner/office and field projections remain independently strict. The field
worker sees assigned operational work but no amount, receivable, commercial
account, unassigned contact or secret. Web/iOS/Android parse the same Golden
Workflow payload, blockers and next action without localized state drift.

## Functional requirements

- **FR-001**: Define a versioned closed internal-E2E scenario and expected checkpoint catalog.
- **FR-002**: Create all identities, contacts, project, financial values, messages and evidence synthetically inside a disposable database.
- **FR-003**: Run the complete forward-only migration chain before the scenario.
- **FR-004**: Use real R32 onboarding/import services rather than direct fixture substitution where a canonical command exists.
- **FR-005**: Use the real R18 intent/clarification path for clear and ambiguous conversational inputs.
- **FR-006**: A clear appointment creates exactly one canonical schedule effect for `LAVAL-E2E-001`.
- **FR-007**: An ambiguous hour creates a clarification and zero calendar write.
- **FR-008**: Use R21 canonical economic state for the 1 200 CAD extra and invoice readiness.
- **FR-009**: Missing written approval and work evidence keep readiness below `READY_TO_INVOICE`.
- **FR-010**: Conflicting approval claims remain independently reconstructible until authorized resolution.
- **FR-011**: Written approval and selected evidence use existing secured/canonical evidence contracts.
- **FR-012**: Authorized contradiction resolution preserves prior evidence and immutable decision provenance.
- **FR-013**: Duplicate/replay inputs create exactly one canonical dossier and one effect per command.
- **FR-014**: Calendar, SMS/MMS, voice, email and accounting adapters remain provider-disabled.
- **FR-015**: Prepared communications expose exact recipient, channel, body, version and fingerprint before approval.
- **FR-016**: Approval changes only local prepared-action state and creates zero delivery.
- **FR-017**: Human escalation uses the R22 lifecycle, bounded access, QC and exact resume.
- **FR-018**: Simulated transient failure and restart preserve stable command identities and canonical state.
- **FR-019**: Disconnect/reconnect the Prisma client at a defined checkpoint and reload all final projections.
- **FR-020**: Record ordered checkpoint hashes before and after restart and one final scenario fingerprint.
- **FR-021**: Owner/office projections expose permitted financial workflow; field projection exposes no financial amount or commercial account.
- **FR-022**: Cross-workspace and unassigned-field reads fail closed.
- **FR-023**: Web and shared mobile strict contracts parse the same canonical Golden Workflow projection.
- **FR-024**: Final timeline reconstructs onboarding, intent, evidence, decisions, actions, human result and verified state in order.
- **FR-025**: Final next action is deterministic and can be selected without manual context restatement.
- **FR-026**: Produce one machine-readable run report with checkpoints, counts, hashes, refusals and exact boundary booleans.
- **FR-027**: The report contains no raw phone, email, credential, environment value or non-synthetic content.
- **FR-028**: Run report state is `INTERNAL_SYNTHETIC_E2E_PASS` only if every mandatory checkpoint passes.
- **FR-029**: R30-R35, migration, root/mobile quality and package validation remain green.
- **FR-030**: No provider, credential, customer data, external transport/write, signing, store, deployment, push, Preview or Production is permitted.

## Failure and exception states

Wrong project, duplicate canonical effect, missing clarification, invented fact,
lost contradiction, premature invoice readiness, action delivery, human-resume
duplication, restart drift, role leak, cross-workspace read, platform contract
drift, missing checkpoint, report secret or provider observation fails the run
atomically and produces a non-PASS report.

## Success criteria

- One synthetic workspace, project, extra dossier and clear appointment exist.
- Ambiguous time creates zero schedule effect and one understandable clarification state.
- Two required evidence gaps block invoicing until both are satisfied.
- Contradictory approval claims remain visible before authorized resolution.
- Final invoice-readiness state is exactly `READY_TO_INVOICE` for 1 200 CAD.
- Every prepared external action has zero delivery and exact approval history.
- One human escalation resumes its origin once after local completion/QC.
- Pre/post-restart canonical fingerprint is identical.
- Owner/office/Web/mobile parity passes while field financial leakage stays zero.
- Final report records `providerObserved=false`, `externalEffectCount=0` and `INTERNAL_SYNTHETIC_E2E_PASS`.

## Assumptions and dependencies

- R18-R22 supply intent, jobs, follow-ups, economics and human escalation.
- R23-R27 supply disabled connector adapters and prepared states.
- R28-R31 supply authority, provenance, privacy and recovery controls.
- R32-R35 supply onboarding, platform parity, commercial/public state and package validation.
- Existing focused tests remain authoritative for details outside the composed story.

## Out of scope

Live LLM interpretation, provider sandbox, real phone/email/calendar/accounting,
real devices, customer or founder observation, store actions, signing,
deployment, public origin, payment, willingness to pay, product-market fit,
Production and Verified-E2E.
