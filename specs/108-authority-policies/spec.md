# Feature Specification: R28 Organization Authority Policies

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: In progress
**Input**: R28 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

ENDVERA gains one canonical organization policy engine that decides, before an
action can advance, whether the action is safe to perform automatically inside
ENDVERA, requires an exact human approval, or is prohibited. The decision is
based on a versioned workspace policy, the registered action definition, role,
resource scope, risk, data classification and any applicable monetary ceiling.

R28 does not dispatch a provider action. It creates a durable authority answer
that downstream local engines can enforce and that an owner can understand,
inspect, supersede and revoke without rewriting history.

## User scenarios and acceptance

### US1 — Define a safe organization policy (P1)

An owner starts from a fail-closed baseline, edits a draft policy set and
activates one exact version. Low-risk reversible internal actions may be
`AUTOMATIC_INTERNAL`; consequential or external-effect-capable actions are at
least `APPROVAL_REQUIRED`; legal commitments, payment initiation, credential
access, destructive deletion and unknown actions are `PROHIBITED`.

### US2 — Evaluate authority at the point of use (P1)

A registered local engine submits the exact action, actor, workspace, target,
risk, data classification, source fingerprint and amount context. ENDVERA
returns one deterministic immutable evaluation bound to the active policy
version. Missing policy, conflicting rules, stale source, unknown action,
cross-workspace input or incomplete context fails closed.

### US3 — Inspect, approve or refuse the exact action (P1)

For `APPROVAL_REQUIRED`, an authorized owner or office manager sees the exact
action, target, policy reason, payload fingerprint, consequences and expiry.
Approval is version/hash bound and cannot approve a changed or expired action.
Repeated or concurrent decisions have one canonical effect. A prohibited
action cannot be converted into an approval through the decision endpoint.

### US4 — Use one role-safe policy cockpit (P2)

Owners can draft, activate, supersede and revoke policy versions. Office
managers can inspect policy and decide only actions allowed by their role.
Field workers see only whether their own requested action is allowed, requires
office review or is prohibited, without policy internals, financial ceilings,
other members, connector authority or sensitive payloads.

## Functional requirements

- **FR-001**: Reuse R10/R11 exact inspection and decisions, R16 roles/capabilities, R17 stable commands and R23-R27 connector boundaries.
- **FR-002**: Maintain an explicit versioned registry of action definitions with risk, reversibility, external-effect capability, required role and data-classification reach.
- **FR-003**: Support exactly `AUTOMATIC_INTERNAL`, `APPROVAL_REQUIRED` and `PROHIBITED` as authority outcomes.
- **FR-004**: Provide a fail-closed baseline where unknown actions, missing policy context, payment initiation, legal commitment, credential access and destructive deletion are prohibited.
- **FR-005**: Permit `AUTOMATIC_INTERNAL` only for registered low-risk, reversible, internal-only actions with no provider spend or external effect.
- **FR-006**: Require at least `APPROVAL_REQUIRED` for every registered action capable of external communication, provider mutation, scheduling mutation or material financial-state change.
- **FR-007**: Persist immutable policy-set versions and rules; editing an active version creates a new draft rather than mutating history.
- **FR-008**: Activate or revoke policy sets through owner-only, exact-version, idempotent and concurrency-safe commands.
- **FR-009**: Resolve overlapping rules deterministically using the strictest applicable outcome; an unresolved conflict is prohibited.
- **FR-010**: Evaluate authority at point of use using server-derived membership, workspace, resource ownership, action definition and active policy version.
- **FR-011**: Bind every evaluation to action key/version, target scope, source fingerprint, payload hash, policy-set version and expiry.
- **FR-012**: Represent applicable monetary ceilings as integer minor units and prohibit an unconfigured or exceeded ceiling.
- **FR-013**: Persist each evaluation and refusal immutably without storing credentials, raw rejected sensitive payloads or cross-workspace content.
- **FR-014**: Bind approval/rejection to the exact evaluation version, policy version, payload hash and authorized decision role.
- **FR-015**: Make replay and concurrent evaluation/decision produce one canonical effect; altered identity reuse is refused.
- **FR-016**: Expose a protected API and one shared iOS/Android policy cockpit with restart-safe draft, activation, revocation and decision commands.
- **FR-017**: Recursively minimize field projections and never expose policy rules, financial ceilings, other-member authority, connector details or protected payloads.
- **FR-018**: Keep `externalTransportPerformed=false`, `externalWritePerformed=false` and `providerEffectCount=0` throughout R28.

## Authorization and tenancy

Only an active owner can activate, supersede or revoke a policy set. Active
owners and office managers may inspect policy summaries. Exact action decisions
remain constrained by both the actor's canonical R16 role and the evaluated
policy. Every resource is reloaded by workspace at point of use. Foreign or
missing resources are indistinguishable from not found.

## Failure and exception states

`DRAFT`, `ACTIVE`, `SUPERSEDED`, `REVOKED`, `AUTOMATIC_INTERNAL`,
`APPROVAL_REQUIRED`, `PROHIBITED`, `APPROVED_LOCAL`, `REJECTED`, `EXPIRED`,
`STALE` and `REFUSED` are explicit. Missing registry entries, incomplete
context, ambiguous scope, conflicting rules or unavailable policy state always
resolve to `PROHIBITED` or refusal, never best effort.

## Success criteria

- 100% of accepted actions receive one version/hash-bound evaluation.
- 0 unknown, conflicting, stale, unauthorized or cross-workspace actions advance.
- 0 external-effect-capable actions receive `AUTOMATIC_INTERNAL`.
- 0 prohibited actions can be approved through the decision path.
- Exactly one policy activation and decision effect under replay/concurrency.
- Exact state and evaluation history reconstruct after process restart.
- 0 field-worker policy, financial, connector or sensitive-payload leakage.
- 0 provider, network, external transport, external write or spend effect.

## Out of scope

- live provider policy enforcement or external dispatch;
- OAuth, credentials, customer data, external messaging, calendar writes,
  accounting writes, payments, contracts or record deletion;
- policy recommendations learned from customer behaviour;
- push, Preview, Production, deployment, EAS or app-store action.
