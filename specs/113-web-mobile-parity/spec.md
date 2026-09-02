# Feature Specification: R33 Web, iOS and Android Golden Workflow Parity

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Ready for implementation
**Input**: R33 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

A contractor can open ENDVERA on Web, iPhone or Android and understand the
same current job state, the same urgent exception and the same next safe action
without learning three different products. The Golden Workflow joins existing
canonical onboarding, assistant intent, projects, scheduling, evidence,
follow-up, receivables, approvals, provenance and human escalation into one
role-safe operating cockpit.

R33 is not a rewrite of the underlying engines, a generic dashboard builder or
three independently implemented applications. It adds one versioned parity
registry, one strict aggregate projection and shared French/English product
language over existing canonical state. Provider execution stays disabled.

## Golden Workflow

`GET_STARTED → CAPTURE_WORK → PLAN_WORK → COLLECT_PROOF → FOLLOW_UP →
READY_TO_INVOICE → APPROVE_ACTION → REVIEW_HISTORY`

Human escalation is an exception route from any step and exact resume returns
to the originating step. Each platform shows one primary next action and may
link to the existing specialized surface without copying technical IDs.

## User scenarios and acceptance

### US1 — Continue from one canonical next action (P1)

An owner or office user opens any supported client and receives the same active
workspace, project context, Golden Workflow step, blocker count and primary
next action derived from PostgreSQL. Navigation or restart cannot advance the
step. A missing prerequisite produces an exact actionable blocker.

### US2 — Complete the Golden Workflow across clients (P1)

The user can begin on Web and continue on iOS or Android through existing
commands: create/resume context, capture work intent, inspect schedule, attach
or inspect evidence, review follow-up and invoice readiness, inspect an exact
prepared action, approve locally, and review history. Each client exposes the
same supported action set and canonical result.

### US3 — Use ENDVERA in French or English (P1)

The user chooses `fr-CA` or `en-CA`. Navigation, headings, statuses, blockers,
errors and primary actions use a complete closed translation catalog. Server
records retain codes rather than localized prose. Unknown locale or copy key
refuses or falls back deterministically to the workspace locale, never a mixed
language screen.

### US4 — Operate with accessible controls (P1)

Keyboard and screen-reader users can identify page/screen title, current step,
progress, blockers, selected state, busy state, errors and primary action.
Mobile controls have explicit accessibility roles/labels and usable touch
targets. Web focus follows the changed heading or error and no action depends
only on colour, icon or gesture.

### US5 — Preserve role-safe parity (P1)

Owner/office and field-worker responses are separate schemas. A field worker
sees only assigned projects, allowed schedule/evidence work and one permitted
next action. Financial amounts, receivables, import controls, policy details,
unassigned contacts, connector secrets and owner-only approvals remain absent.

### US6 — Explain unavailable or failed capabilities (P2)

A disabled connector or quarantined action is shown as unavailable with one
reason and safe local alternative. Clients do not display a provider action as
completed. Network uncertainty preserves the prior canonical state and offers
exact retry through the existing idempotent/outbox mechanism.

## Functional requirements

- **FR-001**: Define one versioned closed Golden Workflow registry with step, capability, route and role metadata.
- **FR-002**: Derive current step, blockers, completed steps and next action from canonical PostgreSQL state; clients cannot submit completion flags.
- **FR-003**: Aggregate only existing Construction state and command links; no R33 shadow project, schedule, evidence, invoice or action record is authoritative.
- **FR-004**: Every projection carries `workspaceId`, role, schema version, generated time and canonical state fingerprint.
- **FR-005**: Point-of-use membership and role are reloaded for every cockpit query and linked command.
- **FR-006**: Owner/office and field-worker projections are independent strict schemas with a deny-by-default field allowlist.
- **FR-007**: Field output excludes money, receivables, invoice readiness detail, imports, organization policy, unassigned contacts/projects and hidden identifiers.
- **FR-008**: Each step names one primary action, zero or more secondary safe links and exact blockers ordered by severity then stable code.
- **FR-009**: Web, iOS and Android consume the same schema and capability registry; platform code may adapt presentation but not business state transitions.
- **FR-010**: Supported locales are exactly `fr-CA` and `en-CA`; unknown locales refuse at command boundaries.
- **FR-011**: Product copy uses a closed typed key catalog with complete values in both supported locales and no server-persisted localized prose.
- **FR-012**: Locale selection persists through the existing user/workspace preference boundary and never changes canonical dates, amounts or identifiers.
- **FR-013**: Dates use the workspace IANA timezone and selected locale; money uses canonical currency and minor units.
- **FR-014**: Web controls expose semantic headings, landmarks, labels, selected/expanded/busy/error state and predictable focus after navigation or validation.
- **FR-015**: Mobile controls expose accessibility role, label, hint and state; primary touch controls meet a minimum 44 by 44 logical-point target.
- **FR-016**: Text remains usable with enlarged mobile system font and common narrow viewport widths without hiding the primary action.
- **FR-017**: No workflow state or action meaning relies only on colour, icon, animation, hover, swipe or sound.
- **FR-018**: Deep links are stable, role-checked and carry only canonical public identifiers needed to open the specialized surface.
- **FR-019**: Unsupported or disabled capabilities expose a closed reason and safe local fallback; the UI cannot claim external completion.
- **FR-020**: Uncertain writes reuse existing exact command retry/outbox semantics and cannot create a second canonical effect.
- **FR-021**: Human escalation preserves originating workflow step, bounded context and resume target without exposing hidden fields.
- **FR-022**: Cockpit refresh after a linked action returns the same canonical result on Web, iOS and Android.
- **FR-023**: The private cockpit API is authenticated, rate-limited, private/no-store and accepts no caller-supplied actor, role, completion or financial visibility.
- **FR-024**: Contract tests enumerate every registry step, role, route, locale and copy key; missing platform mapping or translation fails closed.
- **FR-025**: Accessibility gates cover keyboard order, labels, states, text scaling and narrow viewports with deterministic automated checks plus a documented manual checklist.
- **FR-026**: Parity evidence compares exact canonical fingerprints, next action and allowed capability codes across Web, iOS and Android clients.
- **FR-027**: No provider call, external transport/write, credential, customer data, push, deployment, Preview, Production or store action is permitted.

## Failure and exception states

No active workspace, stale membership, unknown registry version, unmapped route,
missing translation, invalid locale, inconsistent canonical aggregate,
cross-workspace deep link, field projection leak, unavailable capability,
network uncertainty or command collision returns a closed reason. Clients retain
the last verified state and never invent progress.

## Success criteria

- All eight Golden Workflow steps map to an existing canonical state source and a role-checked Web/mobile destination.
- One synthetic owner sees identical workspace, project, current step, blockers and primary action on all three client projections.
- One synthetic field worker receives zero forbidden owner/financial/import field on all three clients.
- Every copy key used by the Golden Workflow exists in `fr-CA` and `en-CA`; mixed-language and unknown-key counts are zero.
- Keyboard-only Web traversal reaches every Golden Workflow action in logical order and exposes validation focus.
- Every mobile primary action has an accessibility label/state and a 44 by 44 logical-point minimum target.
- Narrow Web and enlarged-font mobile render keep title, blocker and primary action available.
- Exact refresh/restart preserves the state fingerprint and next action.
- Unsupported connector capability is visibly unavailable and performs zero external effect.
- Exact uncertain retry creates no duplicate canonical effect.
- Golden Workflow parity tests pass from one shared fixture without platform-specific expected business outcomes.
- Provider, external-effect and customer-data counts remain zero.

## Assumptions and dependencies

- R13 through R32 canonical modules and their private APIs remain authoritative.
- R33 may add aggregate reads, typed registries, localization and presentation; it does not fork command engines.
- Existing Web language cookie and mobile persisted session/preferences can be extended without adding a localization dependency.
- Automated accessibility checks are necessary but do not claim real assistive-technology or device observation.

## Out of scope

New provider behavior, real messages/calls/calendar/accounting, customer data,
live push, billing, public marketing redesign, independent Swift/Kotlin codebases,
TestFlight/Play distribution, deployment, Preview, Production and claims of
customer usability or Verified-E2E coverage.
